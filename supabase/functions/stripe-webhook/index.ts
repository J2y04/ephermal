/**
 * Ephermal — Stripe Webhook Handler (Supabase Edge Function)
 *
 * Deploy: supabase functions deploy stripe-webhook
 *
 * Required env vars (Supabase Dashboard → Settings → Edge Functions):
 *   STRIPE_SECRET_KEY         — sk_live_...
 *   STRIPE_WEBHOOK_SECRET     — whsec_...
 *   CLERK_SECRET_KEY          — sk_...
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 *   SUPABASE_URL              — auto-injected
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Fill in your actual Stripe Price IDs from Stripe Dashboard → Products
const PRICE_TO_PLAN: Record<string, string> = {
  'price_REPLACE_STARTER': 'starter',
  'price_REPLACE_GROWTH':  'growth',
  'price_REPLACE_SCALE':   'scale',
};

const VALID_PLANS = new Set(['starter', 'growth', 'scale']);

async function updateClerkMetadata(clerkUserId: string, plan: string): Promise<void> {
  const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}/metadata`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('CLERK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ public_metadata: { plan } }),
  });
  if (!res.ok) {
    // Log detail server-side only — never expose to response body
    console.error('Clerk metadata update failed:', res.status, await res.text());
    throw new Error('Clerk metadata update failed');
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const clerkUserId = session.metadata?.clerk_user_id;
  if (!clerkUserId) throw new Error('Missing clerk_user_id in session metadata');

  // Guard: only process subscription checkouts
  if (!session.subscription) throw new Error('No subscription on checkout session');

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const priceId = subscription.items.data[0]?.price.id;
  const plan = PRICE_TO_PLAN[priceId] ?? 'starter';
  const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

  await supabase.from('user_plans').upsert({
    user_id: clerkUserId,
    plan,
    stripe_customer_id: session.customer as string,
    stripe_sub_id: subscription.id,
    period_end: periodEnd,
  }, { onConflict: 'user_id' });

  await updateClerkMetadata(clerkUserId, plan);
  console.log(`✓ Activated ${plan} for ${clerkUserId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const clerkUserId = subscription.metadata?.clerk_user_id;
  if (!clerkUserId) return;

  const priceId = subscription.items.data[0]?.price.id;
  const status = subscription.status;
  const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

  let effectivePlan: string;

  if (status === 'active' || status === 'trialing') {
    effectivePlan = PRICE_TO_PLAN[priceId] ?? 'starter';
  } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
    effectivePlan = 'starter';
  } else {
    // incomplete, incomplete_expired, paused — no change
    return;
  }

  // Validate before writing
  if (!VALID_PLANS.has(effectivePlan)) effectivePlan = 'starter';

  await supabase.from('user_plans').upsert({
    user_id: clerkUserId,
    plan: effectivePlan,
    stripe_sub_id: subscription.id,
    period_end: periodEnd,
  }, { onConflict: 'user_id' });

  await updateClerkMetadata(clerkUserId, effectivePlan);
  // Log the actual effective plan (not the raw price lookup)
  console.log(`✓ Plan set to ${effectivePlan} (sub status: ${status}) for ${clerkUserId}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  } catch (err) {
    // Log detail server-side, return generic message to caller
    console.error('Signature verification failed:', err);
    return new Response('Invalid webhook signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      default:
        // Acknowledge but ignore unhandled event types
    }
  } catch (err) {
    // Log detail server-side only
    console.error('Handler error for', event.type, ':', err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
