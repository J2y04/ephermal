/**
 * Ephermal — Stripe Webhook Handler (Supabase Edge Function)
 *
 * Deploy: supabase functions deploy stripe-webhook
 *
 * verify_jwt is deliberately OFF — Stripe never sends a Supabase JWT, only
 * a `stripe-signature` header. This function's own getStripe().webhooks.
 * constructEvent() call IS the real auth boundary (HMAC signature check
 * against STRIPE_WEBHOOK_SECRET). Leaving verify_jwt:true here silently
 * rejects every real Stripe delivery with 401 before this code ever runs —
 * the same class of platform-gateway bug already found and fixed on
 * admin-api (see supabase/functions/admin-api/index.ts).
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

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = new Stripe(key, { apiVersion: '2024-04-10' });
  }
  return _stripe;
}
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

/** ISO 8601 week key, e.g. "2026-W05" — Monday-start week. Mirrors the same helper
 *  in ai-assistant/index.ts; kept as a local copy since each edge function deploys
 *  independently and there's no shared date-utils module. */
function isoWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

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

  const subscription = await getStripe().subscriptions.retrieve(session.subscription as string);
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

  // ISO week key (e.g. "2026-W05") — matches ai-assistant's ai_credits period key,
  // now that the usage limit resets weekly instead of monthly.
  const week = isoWeekKey();

  // Upsert into ai_topups table — idempotent by stripe_pi. Column names must match
  // the actual ai_topups schema (id, user_id, month, messages, stripe_pi, created_at) —
  // this previously wrote to payment_intent_id/credits, neither of which exist on the
  // table, so every top-up insert silently failed and no purchased credits were ever
  // recorded.
  const { error: insertErr } = await supabase.from('ai_topups').upsert({
    stripe_pi: paymentIntent.id,
    user_id:   clerkUserId,
    month:     week,
    messages:  credits,
  }, { onConflict: 'stripe_pi' });

  if (insertErr) {
    console.error('Failed to insert ai_topup:', insertErr);
    throw new Error('ai_topup insert failed');
  }

  // Fire top-up confirmation email (best-effort)
  try {
    const charge = paymentIntent.latest_charge
      ? await getStripe().charges.retrieve(paymentIntent.latest_charge as string)
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

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subId = invoice.subscription as string | null;
  if (!subId) return; // one-off invoice, not a subscription — nothing to degrade or notify about

  let clerkUserId: string | undefined;
  try {
    const subscription = await getStripe().subscriptions.retrieve(subId);
    clerkUserId = subscription.metadata?.clerk_user_id;
  } catch (e) {
    console.error('handlePaymentFailed: failed to retrieve subscription', e);
  }
  if (!clerkUserId) return;

  const attemptCount = invoice.attempt_count ?? 1;

  // Fire failed-payment email (best-effort — don't fail the webhook if email fails).
  // Access downgrade on repeated failure is already handled by handleSubscriptionUpdated
  // once Stripe transitions the subscription to past_due/unpaid — this handler only notifies.
  try {
    const userEmail = invoice.customer_email;
    if (userEmail) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          template: 'payment_failed',
          to: userEmail,
          vars: { name: 'there', attempt: String(attemptCount) },
        }),
      });
    }
  } catch (e) {
    console.warn('Payment-failed email send failed (non-fatal):', e);
  }

  console.log(`✗ Payment failed for ${clerkUserId} (subscription ${subId}, attempt ${attemptCount})`);
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
    event = getStripe().webhooks.constructEvent(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  } catch (err) {
    // Log detail server-side, return generic message to caller
    console.error('Signature verification failed:', err);
    return new Response('Invalid webhook signature', { status: 400 });
  }

  // Idempotency guard: skip if already processed (Stripe may replay events)
  const { data: alreadyProcessed } = await supabase.from('stripe_processed_events')
    .select('event_id').eq('event_id', event.id).maybeSingle();
  if (alreadyProcessed) {
    console.log(`Duplicate Stripe event ignored: ${event.id}`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
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
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Acknowledge but ignore unhandled event types
    }
  } catch (err) {
    // Log detail server-side only
    console.error('Handler error for', event.type, ':', err);
    return new Response('Internal error', { status: 500 });
  }

  // Mark as processed only after the handler succeeds
  const { error: dupErr } = await supabase.from('stripe_processed_events')
    .insert({ event_id: event.id });
  if (dupErr && dupErr.code !== '23505') {
    console.error('stripe_processed_events insert error:', dupErr);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
