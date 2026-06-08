/**
 * Ephermal — OAuth State Init (Supabase Edge Function)
 *
 * Signs the OAuth state string with HMAC-SHA256 so the userId is bound to
 * the authenticated Clerk session. Prevents CSRF attacks where an attacker
 * crafts a state with a victim's userId to steal their OAuth token.
 *
 * Deploy: supabase functions deploy oauth-state-init
 *
 * Required secrets:
 *   OAUTH_STATE_SECRET — any strong random string, e.g. openssl rand -hex 32
 *
 * POST body:  { platform: 'meta'|'shopify'|'google', page: 'setup'|'dashboard', nonce: string }
 * Auth:       Authorization: Bearer <Clerk JWT>
 * Returns:    { state: "userId~page~nonce~hmac" }
 */

import { extractUserId, signOAuthState } from '../_shared/auth.ts';

const VALID_PLATFORMS = new Set(['meta', 'shopify', 'google']);
const VALID_PAGES     = new Set(['setup', 'dashboard']);
const HEX_NONCE_RE    = /^[0-9a-f]{32}$/i;

// Per-user in-process rate limit: 10 state inits per minute
// Resets on cold start — Redis-backed would be stronger but this is sufficient
// given the function already requires a valid Clerk JWT.
const _rlMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const e = _rlMap.get(userId);
  if (!e || now > e.resetAt) { _rlMap.set(userId, { count: 1, resetAt: now + 60_000 }); return false; }
  e.count++;
  return e.count > 10;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  Deno.env.get('APP_URL') ?? 'https://ephermal.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  if (isRateLimited(userId)) {
    return new Response('Too Many Requests', { status: 429, headers: CORS_HEADERS });
  }

  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET');
  if (!stateSecret) {
    console.error('[oauth-state-init] OAUTH_STATE_SECRET not set');
    return new Response('Server configuration error', { status: 503, headers: CORS_HEADERS });
  }

  let body: { platform?: unknown; page?: unknown; nonce?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
  }

  const { platform, page, nonce } = body;

  if (
    typeof platform !== 'string' || !VALID_PLATFORMS.has(platform) ||
    typeof page     !== 'string' || !VALID_PAGES.has(page)         ||
    typeof nonce    !== 'string' || !HEX_NONCE_RE.test(nonce)
  ) {
    return new Response('Invalid parameters', { status: 400, headers: CORS_HEADERS });
  }

  const hmac  = await signOAuthState(stateSecret, userId, platform, page, nonce);
  const state = `${userId}~${page}~${nonce}~${hmac}`;

  return new Response(JSON.stringify({ state }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
