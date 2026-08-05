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
import { topupCostUsd } from '../_shared/ai-usage.ts';

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

// UGC video credit top-up amounts by price ID — €7/credit, packs of 5 (€35) and 15 (€105).
const UGC_VIDEO_TOPUP_CREDITS: Record<string, number> = {
  [Deno.env.get('STRIPE_PRICE_UGC_TOPUP_5')  ?? 'price_REPLACE_UGC_TOPUP5']:  5,
  [Deno.env.get('STRIPE_PRICE_UGC_TOPUP_15') ?? 'price_REPLACE_UGC_TOPUP15']: 15,
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
    const err = new Error('Clerk metadata update failed') as Error & { status?: number };
    err.status = res.status;
    throw err;
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
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
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
      // fetch() only rejects on a network-level failure, not on an HTTP error status — send-email
      // returns ordinary error responses (missing config, bad template, Resend failure) that would
      // otherwise vanish silently with the webhook still logging success.
      if (!res.ok) console.error(`plan_activated email failed for ${clerkUserId}: ${res.status} ${await res.text().catch(() => '')}`);
    }
  } catch (e) {
    console.warn('Email send failed (non-fatal):', e);
  }

  console.log(`✓ Activated ${plan} for ${clerkUserId}`);
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const topupType = paymentIntent.metadata?.type;
  if (topupType === 'ugc_video_topup') return handleUgcVideoTopup(paymentIntent);
  if (topupType === 'ai_usage_topup') return handleAIUsageTopup(paymentIntent);
  // Only handle AI top-up payments — identified by type: 'ai_topup' in metadata
  if (topupType !== 'ai_topup') return;

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
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
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
      if (!res.ok) console.error(`ai_topup_receipt email failed for ${clerkUserId}: ${res.status} ${await res.text().catch(() => '')}`);
    }
  } catch (e) {
    console.warn('Top-up email failed (non-fatal):', e);
  }

  console.log(`✓ AI top-up: ${credits} credits → ${clerkUserId} (payment: ${paymentIntent.id})`);
}

/** AI usage top-up — adds a percentage of the user's weekly AI cost budget for
 *  the current week only (see _shared/ai-usage.ts). Price was computed
 *  server-side at checkout time from the user's plan at that moment; the
 *  extra budget granted here is recomputed from their CURRENT plan, which
 *  could differ if they changed plans between checkout and webhook delivery
 *  (rare, and either direction is a minor rounding difference, not a real
 *  exploit — the amount charged is fixed regardless). */
async function handleAIUsageTopup(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const clerkUserId = paymentIntent.metadata?.clerk_user_id;
  const percent = Number(paymentIntent.metadata?.percent ?? 0);
  if (!clerkUserId) throw new Error('Missing clerk_user_id in payment_intent metadata');
  if (![25, 50, 75, 100].includes(percent)) throw new Error(`Invalid AI usage topup percent: ${percent}`);

  const { data: planRow } = await supabase.from('user_plans').select('plan').eq('user_id', clerkUserId).maybeSingle();
  const plan = planRow?.plan ?? 'starter';
  const extraCostMicros = Math.round(topupCostUsd(plan, percent) * 1_000_000);
  const week = isoWeekKey();

  const { error: insertErr } = await supabase.from('ai_usage_topups').upsert({
    stripe_pi:         paymentIntent.id,
    user_id:           clerkUserId,
    period:            week,
    extra_cost_micros: extraCostMicros,
    percent,
  }, { onConflict: 'stripe_pi' });

  if (insertErr) {
    console.error('Failed to insert ai_usage_topup:', insertErr);
    throw new Error('ai_usage_topup insert failed');
  }

  console.log(`✓ AI usage top-up: +${percent}% (${plan}) → ${clerkUserId} (payment: ${paymentIntent.id})`);
}

/** Calendar month key (YYYY-MM, UTC) — matches ugc_video_credits' reset period,
 *  which mirrors the existing ugc_credits (script credits) table: monthly, not weekly. */
function monthKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7);
}

async function handleUgcVideoTopup(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const clerkUserId = paymentIntent.metadata?.clerk_user_id;
  if (!clerkUserId) throw new Error('Missing clerk_user_id in payment_intent metadata');

  const priceId = paymentIntent.metadata?.price_id;
  const credits = priceId != null ? UGC_VIDEO_TOPUP_CREDITS[priceId] : undefined;
  if (credits === undefined) {
    console.error(`Unknown UGC video top-up price ID "${priceId}" — check STRIPE_PRICE_UGC_TOPUP_* env vars.`);
    throw new Error(`Unknown UGC video top-up price ID: ${priceId}`);
  }

  // Idempotent by stripe_pi (unique constraint on ugc_video_topups.stripe_pi).
  const { error: insertErr } = await supabase.from('ugc_video_topups').upsert({
    stripe_pi: paymentIntent.id,
    user_id:   clerkUserId,
    month:     monthKey(),
    credits,
  }, { onConflict: 'stripe_pi' });

  if (insertErr) {
    console.error('Failed to insert ugc_video_topup:', insertErr);
    throw new Error('ugc_video_topup insert failed');
  }

  try {
    const charge = paymentIntent.latest_charge
      ? await getStripe().charges.retrieve(paymentIntent.latest_charge as string)
      : null;
    const userEmail = charge?.billing_details?.email;
    if (userEmail) {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          template: 'ugc_video_topup_receipt',
          to: userEmail,
          vars: { name: 'there', credits: String(credits) },
        }),
      });
      if (!res.ok) console.error(`ugc_video_topup_receipt email failed for ${clerkUserId}: ${res.status} ${await res.text().catch(() => '')}`);
    }
  } catch (e) {
    console.warn('UGC video top-up email failed (non-fatal):', e);
  }

  console.log(`✓ UGC video top-up: ${credits} credits → ${clerkUserId} (payment: ${paymentIntent.id})`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  // The embedded event payload is a snapshot from when Stripe generated the event. Stripe does
  // not guarantee webhook delivery order (retries, network delays), so a stale event delivered
  // after a newer one can silently revert plan/cancellation state if trusted directly — e.g. a
  // rapid cancel-then-reactivate where the 'cancelled' event's delivery lands after the
  // 'reactivated' one. Re-fetching the subscription's CURRENT state from Stripe means any two
  // events for the same subscription converge on the same live truth regardless of delivery
  // order, closing that race.
  const current = await getStripe().subscriptions.retrieve(subscription.id);

  const clerkUserId = current.metadata?.clerk_user_id;
  if (!clerkUserId) return;

  const priceId = current.items.data[0]?.price.id;
  const status = current.status;
  const periodEnd = new Date(current.current_period_end * 1000).toISOString();

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
  const cancellingAt = (status === 'active' || status === 'trialing') && current.cancel_at_period_end
    ? periodEnd
    : null;

  await supabase.from('user_plans').upsert({
    user_id: clerkUserId,
    plan: effectivePlan,
    stripe_sub_id: current.id,
    period_end: periodEnd,
    ...(cancellingAt !== null ? { cancelling_at: cancellingAt } : { cancelling_at: null }),
  }, { onConflict: 'user_id' });

  try {
    await updateClerkMetadata(clerkUserId, effectivePlan);
  } catch (e) {
    // A 404 here means the Clerk identity is already gone — most likely an out-of-band
    // deletion (see clerk-webhook's cleanupDeletedUser) that failed to cancel this
    // subscription in Stripe first, so Stripe keeps sending renewal/update events for a
    // user who no longer exists. The user_plans upsert above already ran and recorded the
    // real subscription state, so there's nothing left to reconcile — swallow this specific
    // case so the event is marked processed instead of retrying forever against a Clerk user
    // that will never come back. Any other failure (network, auth, Clerk outage) still throws
    // so Stripe's normal retry behavior applies.
    if ((e as { status?: number })?.status === 404) {
      console.warn(`Clerk user ${clerkUserId} not found (already deleted) — skipping metadata update, subscription state still recorded in user_plans`);
    } else {
      throw e;
    }
  }
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
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
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
      // Highest-trust email in this file — a user whose card fails deserves to know. Log loudly
      // on failure since this previously vanished with zero trace on any non-2xx from send-email.
      if (!res.ok) console.error(`payment_failed email failed for ${clerkUserId}: ${res.status} ${await res.text().catch(() => '')}`);
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

  // Idempotency guard: claim the event FIRST (insert before processing) rather than
  // check-then-act (SELECT, then INSERT only after the handler finishes) — the old order left
  // a window where two near-simultaneous deliveries of the same event.id (which Stripe
  // documents as possible) could both pass the "not yet processed" check and both run the
  // handler concurrently, double-sending the best-effort transactional emails inside it. The
  // unique constraint on event_id makes this insert an atomic claim.
  const { error: claimErr } = await supabase.from('stripe_processed_events')
    .insert({ event_id: event.id });
  if (claimErr) {
    if (claimErr.code === '23505') {
      console.log(`Duplicate Stripe event ignored: ${event.id}`);
      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('stripe_processed_events claim insert error:', claimErr);
    return new Response('Internal error', { status: 500 });
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
    // Release the claim so a genuine Stripe retry can re-attempt the handler instead of being
    // silently swallowed as "already processed" by the claim row inserted above.
    await supabase.from('stripe_processed_events').delete().eq('event_id', event.id);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
