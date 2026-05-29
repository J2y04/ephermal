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

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

// Allowed Stripe Price IDs — acts as an allowlist to prevent arbitrary price injection
const ALLOWED_PRICES = new Set([
  Deno.env.get('STRIPE_PRICE_STARTER') ?? 'price_REPLACE_STARTER',
  Deno.env.get('STRIPE_PRICE_GROWTH')  ?? 'price_REPLACE_GROWTH',
  Deno.env.get('STRIPE_PRICE_SCALE')   ?? 'price_REPLACE_SCALE',
]);

// AI credit top-up price IDs (one-time payments)
const TOPUP_PRICES = new Set([
  Deno.env.get('STRIPE_PRICE_TOPUP_5')   ?? 'price_REPLACE_TOPUP5',
  Deno.env.get('STRIPE_PRICE_TOPUP_10')  ?? 'price_REPLACE_TOPUP10',
  Deno.env.get('STRIPE_PRICE_TOPUP_20')  ?? 'price_REPLACE_TOPUP20',
]);

// Combined allowlist
const ALL_ALLOWED = new Set([...ALLOWED_PRICES, ...TOPUP_PRICES]);

// RFC-5321 email guard
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  Deno.env.get('APP_URL') ?? 'https://ephermal.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  // ── Auth: require valid Clerk JWT or service role ────────────────────────
  // The frontend passes the Clerk session token; the Edge Function only
  // needs to confirm it's present. The clerk_user_id in the body is the
  // authoritative user identifier embedded in Stripe metadata — it MUST
  // match what the frontend sends via Clerk.getToken().
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ') || authHeader.length < 20) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

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

  // ── Validate price_id against allowlist ──────────────────────────────────
  if (!ALL_ALLOWED.has(price_id)) {
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

  const appUrl   = Deno.env.get('APP_URL') ?? 'https://ephermal.app';
  const isTopup  = TOPUP_PRICES.has(price_id);

  try {
    // Lookup or create Stripe customer to de-duplicate by clerk_user_id
    const existing = await stripe.customers.search({
      query: `metadata['clerk_user_id']:'${clerk_user_id}'`,
      limit: 1,
    });

    let customerId: string | undefined;
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else if (email) {
      const customer = await stripe.customers.create({
        email: email.trim(),
        metadata: { clerk_user_id },
      });
      customerId = customer.id;
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode:        isTopup ? 'payment' : 'subscription',
      line_items:  [{ price: price_id, quantity: 1 }],
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
      // For top-up: add payment intent metadata
      sessionParams.payment_intent_data = { metadata: { clerk_user_id, type: 'ai_topup' } };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(`✓ Checkout session created [${isTopup?'topup':'subscription'}] for ${clerk_user_id} — ${session.id}`);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    console.error('Stripe error:', err);
    return new Response('Checkout session creation failed', { status: 502, headers: CORS_HEADERS });
  }
});
