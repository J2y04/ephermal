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

// AI top-up credit amounts by price ID
// Keys: Stripe Price IDs for one-time top-up products
// Values: number of AI messages to credit
const TOPUP_CREDITS: Record<string, number> = {
  [Deno.env.get('STRIPE_PRICE_TOPUP_5')  ?? 'price_REPLACE_TOPUP5']:  50,
  [Deno.env.get('STRIPE_PRICE_TOPUP_10') ?? 'price_REPLACE_TOPUP10']: 120,
  [Deno.env.get('STRIPE_PRICE_TOPUP_20') ?? 'price_REPLACE_TOPUP20']: 280,
};

const PRICE_TO_PLAN: Record<string, string> = {};
const _pStarter = Deno.env.get('STRIPE_PRICE_STARTER');
const _pGrowth  = Deno.env.get('STRIPE_PRICE_GROWTH');
const _pScale   = Deno.env.get('STRIPE_PRICE_SCALE');
if (_pStarter) PRICE_TO_PLAN[_pStarter] = 'starter';
if (_pGrowth)  PRICE_TO_PLAN[_pGrowth]  = 'growth';
if (_pScale)   PRICE_TO_PLAN[_pScale]   = 'scale';

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
  const plan = PRICE_TO_PLAN[priceId];
  if (!plan) {
    console.error(`Unknown price ID "${priceId}" — not in PRICE_TO_PLAN. Check STRIPE_PRICE_* env vars.`);
    throw new Error(`Unknown price ID: ${priceId}`);
  }
  const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

  await supabase.from('user_plans').upsert({
    user_id: clerkUserId,
    plan,
    stripe_customer_id: session.customer as string,
    stripe_sub_id: subscription.id,
    period_end: periodEnd,
  }, { onConflict: 'user_id' });

  await updateClerkMetadata(clerkUserId, plan);

  // Fire plan-activated email (best-effort — don't fail the webhook if email fails)
  try {
    const userEmail = session.customer_details?.email ?? session.customer_email;
    const userName  = session.customer_details?.name?.split(' ')[0] ?? 'there';
    if (userEmail) {
      const templateMap: Record<string, string> = {
        starter: 'plan_activated_starter',
        growth:  'plan_activated_growth',
        scale:   'plan_activated_scale',
      };
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          template: templateMap[plan] ?? 'plan_activated_starter',
          to: userEmail,
          vars: { name: userName },
        }),
      });
    }
  } catch (e) {
    console.warn('Email send failed (non-fatal):', e);
  }

  console.log(`✓ Activated ${plan} for ${clerkUserId}`);
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  // Only handle AI top-up payments — identified by type: 'ai_topup' in metadata
  if (paymentIntent.metadata?.type !== 'ai_topup') return;

  const clerkUserId = paymentIntent.metadata?.clerk_user_id;
  if (!clerkUserId) throw new Error('Missing clerk_user_id in payment_intent metadata');

  // Find the price ID from the payment intent's line items (via the charges)
  // For top-ups we stored the price in metadata at checkout creation
  const priceId = paymentIntent.metadata?.price_id;

  // Resolve credit amount — fail loudly if price not found (misconfigured env vars)
  const credits = priceId != null ? TOPUP_CREDITS[priceId] : undefined;
  if (credits === undefined) {
    console.error(`Unknown top-up price ID "${priceId}" — check STRIPE_PRICE_TOPUP_* env vars.`);
    throw new Error(`Unknown top-up price ID: ${priceId}`);
  }

  // Current month key YYYY-MM (UTC)
  const month = new Date().toISOString().slice(0, 7);

  // Upsert into ai_topups table — idempotent by payment_intent_id
  const { error: insertErr } = await supabase.from('ai_topups').upsert({
    payment_intent_id: paymentIntent.id,
    user_id:   clerkUserId,
    month,
    credits,
    amount_paid: paymentIntent.amount,
    currency:    paymentIntent.currency,
  }, { onConflict: 'payment_intent_id' });

  if (insertErr) {
    console.error('Failed to insert ai_topup:', insertErr);
    throw new Error('ai_topup insert failed');
  }

  // Fire top-up confirmation email (best-effort)
  try {
    const charge = paymentIntent.latest_charge
      ? await stripe.charges.retrieve(paymentIntent.latest_charge as string)
      : null;
    const userEmail = charge?.billing_details?.email;
    if (userEmail) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          template: 'ai_topup_receipt',
          to: userEmail,
          vars: { name: 'there', credits: String(credits) },
        }),
      });
    }
  } catch (e) {
    console.warn('Top-up email failed (non-fatal):', e);
  }

  console.log(`✓ AI top-up: ${credits} credits → ${clerkUserId} (payment: ${paymentIntent.id})`);
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

  // If active but cancel_at_period_end is set, record the pending cancellation date
  const cancellingAt = (status === 'active' || status === 'trialing') && subscription.cancel_at_period_end
    ? periodEnd
    : null;

  await supabase.from('user_plans').upsert({
    user_id: clerkUserId,
    plan: effectivePlan,
    stripe_sub_id: subscription.id,
    period_end: periodEnd,
    ...(cancellingAt !== null ? { cancelling_at: cancellingAt } : { cancelling_at: null }),
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

  // Idempotency guard: skip if already processed (Stripe may replay events)
  const { error: dupErr } = await supabase.from('stripe_processed_events')
    .insert({ event_id: event.id });
  if (dupErr) {
    // Unique violation = already processed; other errors we log and continue
    if (dupErr.code === '23505') {
      console.log(`Duplicate Stripe event ignored: ${event.id}`);
      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('stripe_processed_events insert error:', dupErr);
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
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
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
