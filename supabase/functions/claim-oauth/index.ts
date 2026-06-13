/**
 * Ephermal — OAuth Claim Exchange (Supabase Edge Function)
 *
 * Called by the frontend immediately after an OAuth redirect to exchange
 * the one-time claim code for the actual platform token.
 *
 * Security properties:
 *  - Claim is a UUID (128-bit entropy) — hard to guess
 *  - Single-use: marked `used = true` atomically on first exchange
 *  - 5-minute TTL: expired claims are rejected
 *  - user_id must match the claim record (prevents cross-user theft)
 *  - Long-lived token is never placed in a URL (browser history / server logs)
 *
 * Deploy: supabase functions deploy claim-oauth
 *
 * Required secrets: none beyond auto-injected Supabase vars.
 *
 * Auto-injected by Supabase (no action needed):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractUserId } from '../_shared/auth.ts'

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow the production domain + Vercel previews during development.
const ALLOWED_ORIGINS = [
  'https://ephermal.app',
  'https://www.ephermal.app',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/ephermal-[a-z0-9-]+\.vercel\.app$/.test(origin)
  )
    ? origin
    : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
    'Access-Control-Max-Age':       '86400',
  }
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

// ── UUID validation regex ─────────────────────────────────────────────────────
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin)
  }

  // ── Verify Clerk JWT — identity must come from the signed token ─────────
  const verifiedUserId = await extractUserId(req.headers.get('Authorization'))
  if (!verifiedUserId) {
    return json({ error: 'unauthorized' }, 401, origin)
  }

  // ── Parse request body ───────────────────────────────────────────────────
  let body: { claim?: unknown; platform?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, origin)
  }

  const { claim, platform } = body

  // ── Strict input validation ──────────────────────────────────────────────
  if (
    typeof claim    !== 'string' || !UUID_RE.test(claim) ||
    typeof platform !== 'string' || !['meta', 'shopify', 'google'].includes(platform)
  ) {
    return json({ error: 'invalid_request' }, 400, origin)
  }

  // ── Atomic claim exchange ────────────────────────────────────────────────
  // Update `used = true` only if:
  //   - id matches the claim code
  //   - user_id matches the verified JWT identity (prevents cross-user theft)
  //   - platform matches
  //   - not already used
  //   - not expired
  // Returning `payload` gives us the token in one round-trip.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('oauth_claims')
    .update({ used: true })
    .eq('id',       claim)
    .eq('user_id',  verifiedUserId)
    .eq('platform', platform)
    .eq('used',     false)
    .gt('expires_at', now)
    .select('payload')
    .single()

  if (error || !data) {
    // Claim not found, already used, expired, or user/platform mismatch.
    // Return a generic 404 — don't leak which condition failed.
    console.warn('[claim-oauth] Claim exchange failed — invalid, expired, or already used')
    return json({ error: 'claim_invalid_or_expired' }, 404, origin)
  }

  // ── Return the payload (contains access_token + account info) ────────────
  return json(data.payload, 200, origin)
})
