/**
 * Ephermal — Create Checkout Session (Supabase Edge Function)
 *
 * Generates a Stripe Checkout Session for subscription plans.
 * Called from the frontend billing page when user clicks a plan button.
 *
 * Deploy: supabase functions deploy create-checkout
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY         — sk_live_... (or sk_test_...)
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 *   APP_URL                   — https://ephermal.app
 *
 * POST body:
 *   { "price_id": "price_xxx", "clerk_user_id": "user_xxx", "email": "user@example.com" }
 *
 * Returns:
 *   { "url": "https://checkout.stripe.com/..." }
 */

import Stripe from 'https://esm.sh/stripe@14';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders } from '../_shared/auth.ts';
import { rateLimitTiered } from '../_shared/rate-limit.ts';
import { topupPriceEurCents, TOPUP_PERCENTS } from '../_shared/ai-usage.ts';
import { captureException } from '../_shared/sentry.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = new Stripe(key, { apiVersion: '2024-04-10' });
  }
  return _stripe;
}

// Allowed Stripe Price IDs — acts as an allowlist to prevent arbitrary price injection
const ALLOWED_PRICES = new Set([
  Deno.env.get('STRIPE_PRICE_STARTER') ?? 'price_REPLACE_STARTER',
  Deno.env.get('STRIPE_PRICE_GROWTH')  ?? 'price_REPLACE_GROWTH',
  Deno.env.get('STRIPE_PRICE_SCALE')   ?? 'price_REPLACE_SCALE',
]);

// AI message credit top-up price IDs (one-time payments)
const AI_TOPUP_PRICES = new Set([
  Deno.env.get('STRIPE_PRICE_TOPUP_5')   ?? 'price_REPLACE_TOPUP5',
  Deno.env.get('STRIPE_PRICE_TOPUP_10')  ?? 'price_REPLACE_TOPUP10',
  Deno.env.get('STRIPE_PRICE_TOPUP_20')  ?? 'price_REPLACE_TOPUP20',
]);

// UGC video credit top-up price IDs (one-time payments) — €7/credit,
// packs of 5 (€35) and 15 (€105). Kept distinct from AI_TOPUP_PRICES so the
// webhook can tell which credit pool to top up.
const UGC_VIDEO_TOPUP_PRICES = new Set([
  Deno.env.get('STRIPE_PRICE_UGC_TOPUP_5')  ?? 'price_REPLACE_UGC_TOPUP5',
  Deno.env.get('STRIPE_PRICE_UGC_TOPUP_15') ?? 'price_REPLACE_UGC_TOPUP15',
]);

const TOPUP_PRICES = new Set([...AI_TOPUP_PRICES, ...UGC_VIDEO_TOPUP_PRICES]);

// Combined allowlist — strip placeholder values so invalid IDs never reach Stripe
const ALL_ALLOWED = new Set(
  [...ALLOWED_PRICES, ...TOPUP_PRICES].filter(p => !p.startsWith('price_REPLACE_'))
);

// RFC-5321 email guard
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  // Was a static single-origin header (always https://ephermal.app, since
  // APP_URL was never actually set as a secret) instead of the shared
  // multi-origin helper every other function uses — meant every checkout
  // call from the real dashboard at https://dashboard.ephermal.app was
  // silently CORS-blocked on the response. Same bug as oauth-state-init.
  const CORS_HEADERS = corsHeaders(req.headers.get('origin'));

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  // ── Auth: verify JWT and extract userId ──────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwtUserId = await extractUserId(authHeader);

  let body: { price_id: string; clerk_user_id: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
  }

  const { price_id, clerk_user_id, email } = body;

  if (!price_id || !clerk_user_id) {
    return new Response('Missing required fields: price_id, clerk_user_id', {
      status: 400, headers: CORS_HEADERS,
    });
  }

  // AI usage top-ups don't have a fixed Stripe Price ID - the price depends on
  // the user's plan (25% of a Starter budget costs less than 25% of a Scale
  // budget), so it's computed server-side and passed to Stripe as inline
  // price_data instead of a pre-created price. "ai_usage_topup_<percent>" is
  // a synthetic ID, never sent to Stripe directly.
  const aiUsageTopupMatch = /^ai_usage_topup_(\d+)$/.exec(price_id);
  const aiUsageTopupPercent = aiUsageTopupMatch ? Number(aiUsageTopupMatch[1]) : null;
  const isAIUsageTopup = aiUsageTopupPercent !== null && (TOPUP_PERCENTS as readonly number[]).includes(aiUsageTopupPercent);

  // ── Validate price_id against allowlist ──────────────────────────────────
  if (!isAIUsageTopup && !ALL_ALLOWED.has(price_id)) {
    return new Response('Invalid price', { status: 400, headers: CORS_HEADERS });
  }

  // ── Validate email if provided ───────────────────────────────────────────
  if (email && (!EMAIL_RE.test(email.trim()) || email.length > 320)) {
    return new Response('Invalid email', { status: 400, headers: CORS_HEADERS });
  }

  // ── Sanitise clerk_user_id — Clerk IDs match user_[a-zA-Z0-9]+ ─────────
  if (!/^user_[a-zA-Z0-9_]+$/.test(clerk_user_id) || clerk_user_id.length > 64) {
    return new Response('Invalid user ID', { status: 400, headers: CORS_HEADERS });
  }

  // ── Verify clerk_user_id matches the authenticated JWT ───────────────────
  if (!jwtUserId || jwtUserId !== clerk_user_id) {
    return new Response('Unauthorized — user ID mismatch', { status: 403, headers: CORS_HEADERS });
  }

  // ── Rate limit: checkout session creation has no legitimate reason to be
  // called rapidly — a tight cap here costs nothing for real users and closes
  // off using this endpoint to hammer Stripe's API or enumerate price behavior.
  const rl = await rateLimitTiered(jwtUserId, 'checkout', [
    { max: 5,  window: 60   },
    { max: 20, window: 3600 },
  ]);
  if (!rl.allowed) {
    return new Response('Too many requests — please wait a moment and try again', {
      status: 429, headers: CORS_HEADERS,
    });
  }

  const appUrl   = Deno.env.get('APP_URL') ?? 'https://ephermal.app';
  const isTopup  = TOPUP_PRICES.has(price_id) || isAIUsageTopup;

  try {
    // Lookup or create Stripe customer to de-duplicate by clerk_user_id. customers.search is
    // Stripe's own eventually-consistent search API (their docs note results can lag writes by
    // a few seconds) — two near-simultaneous requests (double-click, client retry) can both find
    // zero results and each call customers.create, producing two Stripe Customers for the same
    // clerk_user_id. A stable idempotency key keyed only on clerk_user_id closes that race: any
    // retry of "create the customer for this user" always resolves to the one already created.
    const existing = await getStripe().customers.search({
      query: `metadata['clerk_user_id']:'${clerk_user_id}'`,
      limit: 1,
    });

    let customerId: string | undefined;
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else if (email) {
      const customer = await getStripe().customers.create({
        email: email.trim(),
        metadata: { clerk_user_id },
      }, { idempotencyKey: `customer-create-${clerk_user_id}` });
      customerId = customer.id;
    }

    // Plan switch (upgrade/downgrade) for an existing subscriber must never go through
    // Checkout again — Checkout Sessions in mode:'subscription' always create a BRAND NEW
    // Stripe Subscription object, and user_plans.stripe_sub_id (the table's only pointer to
    // "the" subscription) would silently be overwritten with the new one, permanently
    // orphaning the old subscription — still live, still billing, unreachable by
    // cancel-subscription or admin-api (both only ever read the single stored stripe_sub_id)
    // since there's no Stripe Customer Portal integration either. Instead, swap the price on
    // the existing subscription directly.
    if (!isTopup) {
      const { data: planRow } = await supabase.from('user_plans').select('stripe_sub_id').eq('user_id', clerk_user_id).maybeSingle();
      const existingSubId = planRow?.stripe_sub_id as string | undefined;
      if (existingSubId) {
        try {
          const existingSub = await getStripe().subscriptions.retrieve(existingSubId);
          const liveStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid']);
          if (liveStatuses.has(existingSub.status)) {
            const currentItem = existingSub.items.data[0];
            if (currentItem?.price.id === price_id) {
              return new Response(JSON.stringify({ switched: true, message: "You're already on this plan" }), {
                status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
              });
            }
            const idempotencyBucket = Math.floor(Date.now() / 300_000);
            await getStripe().subscriptions.update(existingSubId, {
              items: [{ id: currentItem.id, price: price_id }],
              proration_behavior: 'create_prorations',
              metadata: { clerk_user_id },
            }, { idempotencyKey: `plan-switch-${clerk_user_id}-${price_id}-${idempotencyBucket}` });
            console.log(`✓ Plan switched in place for ${clerk_user_id} — subscription ${existingSubId} now on ${price_id}`);
            return new Response(JSON.stringify({ switched: true, message: 'Plan updated' }), {
              status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            });
          }
          // Existing subscription is canceled/incomplete_expired/etc — not actually live in
          // Stripe, safe to fall through and start a fresh Checkout Session below.
        } catch (e) {
          // Stripe couldn't find/retrieve the stored ID (deleted, bad data) — same as above,
          // nothing live to conflict with, fall through to a normal new Checkout Session.
          console.warn(`Stored stripe_sub_id ${existingSubId} for ${clerk_user_id} is stale/invalid, starting fresh checkout:`, e);
        }
      }
    }

    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    let topupType = '';
    if (isAIUsageTopup) {
      const { data: planRow } = await supabase.from('user_plans').select('plan').eq('user_id', clerk_user_id).maybeSingle();
      const plan = planRow?.plan ?? 'starter';
      const amountCents = topupPriceEurCents(plan, aiUsageTopupPercent!);
      lineItems = [{
        price_data: {
          currency: 'eur',
          product_data: { name: `+${aiUsageTopupPercent}% AI usage (this week)` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }];
      topupType = 'ai_usage_topup';
    } else {
      lineItems = [{ price: price_id, quantity: 1 }];
      topupType = UGC_VIDEO_TOPUP_PRICES.has(price_id) ? 'ugc_video_topup' : 'ai_topup';
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode:        isTopup ? 'payment' : 'subscription',
      line_items:  lineItems,
      success_url: `${appUrl}/dashboard.html?checkout=success&plan=${encodeURIComponent(price_id)}`,
      cancel_url:  `${appUrl}/dashboard.html?checkout=cancelled`,
      metadata: { clerk_user_id },
      ...(customerId ? { customer: customerId } : email ? { customer_email: email.trim() } : {}),
    };

    // For subscriptions: add billing address collection + allow promotion codes
    if (!isTopup) {
      sessionParams.billing_address_collection = 'auto';
      sessionParams.allow_promotion_codes = true;
      // Pass clerk_user_id into subscription metadata so stripe-webhook can read it
      sessionParams.subscription_data = { metadata: { clerk_user_id } };
    } else {
      // For top-up: add payment intent metadata — type tells the webhook which
      // credit pool to top up (AI chat messages vs UGC video credits vs AI usage %).
      sessionParams.payment_intent_data = {
        metadata: isAIUsageTopup
          ? { clerk_user_id, type: topupType, percent: String(aiUsageTopupPercent) }
          : { clerk_user_id, type: topupType, price_id },
      };
    }

    // Bucketed idempotency key: retries of the same checkout attempt (double-click, client
    // timeout retry, mobile network hiccup) within a 5-minute window resolve to the same Stripe
    // Checkout Session instead of creating a duplicate; a genuinely new checkout a few minutes
    // later still gets a fresh session.
    const idempotencyBucket = Math.floor(Date.now() / 300_000);
    const session = await getStripe().checkout.sessions.create(sessionParams, {
      idempotencyKey: `checkout-${clerk_user_id}-${price_id}-${idempotencyBucket}`,
    });

    console.log(`✓ Checkout session created [${isTopup?'topup':'subscription'}] for ${clerk_user_id} — ${session.id}`);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    console.error('Stripe error:', err);
    captureException(err, { fn: 'create-checkout', at: 'stripe' });
    return new Response('Checkout session creation failed', { status: 502, headers: CORS_HEADERS });
  }
});
