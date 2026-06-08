/**
 * Ephermal — Shopify OAuth Callback (Supabase Edge Function)
 *
 * Triggered by Shopify after the merchant grants access.
 * Performs HMAC verification + code exchange using SHOPIFY_API_SECRET
 * (server-side only — never exposed to the browser).
 *
 * Deploy: supabase functions deploy shopify-oauth-callback
 *
 * Required secrets (supabase secrets set KEY=value):
 *   SHOPIFY_APP_KEY      — from Shopify Partner Dashboard → App → Client ID
 *   SHOPIFY_API_SECRET   — same location (NEVER put in frontend code)
 *   APP_URL              — https://ephermal.app
 *
 * Auto-injected by Supabase (no action needed):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { signOAuthState, timingSafeEqualHex } from '../_shared/auth.ts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function redirectTo(
  base: string,
  page: 'setup.html' | 'dashboard.html',
  params: Record<string, string>,
): Response {
  const dest = new URL(`${base.replace(/\/$/, '')}/${page}`)
  for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v)
  return new Response(null, { status: 302, headers: { Location: dest.toString() } })
}

/**
 * Verify Shopify's HMAC signature using Web Crypto (constant-time).
 * Builds the sorted query string from all params except `hmac`,
 * then computes HMAC-SHA256 with the API secret and compares.
 */
async function verifyShopifyHmac(
  searchParams: URLSearchParams,
  secret: string,
): Promise<boolean> {
  const receivedHmac = searchParams.get('hmac')
  if (!receivedHmac || !/^[0-9a-f]{64}$/i.test(receivedHmac)) return false

  // Build the sorted, joined message string (exclude hmac itself)
  const message = [...searchParams.entries()]
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  // Import secret key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  // Sign the message
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    new TextEncoder().encode(message),
  )

  // Convert to hex
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison (prevent timing attacks)
  if (computed.length !== receivedHmac.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ receivedHmac.charCodeAt(i)
  }
  return diff === 0
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Only GET — this is a browser redirect from Shopify
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url     = new URL(req.url)
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://ephermal.app'

  const code  = url.searchParams.get('code')
  const shop  = url.searchParams.get('shop')
  const hmac  = url.searchParams.get('hmac')
  const state = url.searchParams.get('state') ?? ''

  // ── Validate required params ─────────────────────────────────────────────
  if (!code || !shop || !hmac) {
    return redirectTo(APP_URL, 'setup.html', { shopify_error: 'missing_params' })
  }

  // ── Strict shop domain validation ────────────────────────────────────────
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    console.error('[shopify-oauth] Invalid shop domain:', shop)
    return redirectTo(APP_URL, 'setup.html', { shopify_error: 'invalid_shop' })
  }

  // ── Parse & validate state: format is userId~page~nonce~stateHmac ───────
  const parts      = state.split('~')
  const userId     = parts[0] ?? ''
  const sourcePage = parts[1] ?? ''
  const nonce      = parts[2] ?? ''
  const stateHmac  = parts[3] ?? ''

  if (!userId || !nonce || !stateHmac || !['setup', 'dashboard'].includes(sourcePage)) {
    return redirectTo(APP_URL, 'setup.html', { shopify_error: 'invalid_state' })
  }

  const returnPage: 'setup.html' | 'dashboard.html' =
    sourcePage === 'dashboard' ? 'dashboard.html' : 'setup.html'

  // ── Verify state HMAC — ensures userId was set by an authenticated server call ─
  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET') ?? ''
  if (!stateSecret) {
    console.error('[shopify-oauth] OAUTH_STATE_SECRET not configured')
    return redirectTo(APP_URL, returnPage, { shopify_error: 'server_config_error' })
  }
  const expectedStateHmac = await signOAuthState(stateSecret, userId, 'shopify', sourcePage, nonce)
  if (!timingSafeEqualHex(expectedStateHmac, stateHmac)) {
    console.error('[shopify-oauth] State HMAC verification failed')
    return redirectTo(APP_URL, 'setup.html', { shopify_error: 'invalid_state' })
  }

  // ── Read secrets ─────────────────────────────────────────────────────────
  const SHOPIFY_APP_KEY    = Deno.env.get('SHOPIFY_APP_KEY')
  const SHOPIFY_API_SECRET = Deno.env.get('SHOPIFY_API_SECRET')

  if (!SHOPIFY_APP_KEY || !SHOPIFY_API_SECRET) {
    console.error('[shopify-oauth] Missing required env vars')
    return redirectTo(APP_URL, returnPage, { shopify_error: 'server_config_error' })
  }

  // ── HMAC verification (tamper protection) ────────────────────────────────
  const hmacValid = await verifyShopifyHmac(url.searchParams, SHOPIFY_API_SECRET)
  if (!hmacValid) {
    console.error('[shopify-oauth] HMAC verification failed for shop:', shop)
    return redirectTo(APP_URL, returnPage, { shopify_error: 'security_check_failed' })
  }

  // ── Exchange authorization code for permanent access token ───────────────
  let accessToken: string
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     SHOPIFY_APP_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    })
    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      console.error('[shopify-oauth] Token exchange failed:', JSON.stringify(tokenData))
      return redirectTo(APP_URL, returnPage, { shopify_error: 'auth_failed' })
    }
    accessToken = tokenData.access_token as string
  } catch (e) {
    console.error('[shopify-oauth] Token exchange threw:', e)
    return redirectTo(APP_URL, returnPage, { shopify_error: 'network_error' })
  }

  // ── Fetch shop display name ──────────────────────────────────────────────
  let shopName = shop
  try {
    const shopRes  = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })
    const shopData = await shopRes.json()
    shopName = (shopData.shop?.name as string) || shop
  } catch (e) {
    console.error('[shopify-oauth] Shop info fetch threw:', e)
    // Non-fatal — use raw domain as name
  }

  // ── Persist to Supabase ──────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error: upsertErr } = await supabase
    .from('user_integrations')
    .upsert(
      {
        user_id:           userId,
        shopify_token:     accessToken,
        shopify_shop:      shop,
        shopify_shop_name: shopName,
      },
      { onConflict: 'user_id' },
    )
  if (upsertErr) {
    console.error('[shopify-oauth] user_integrations upsert failed:', upsertErr.message)
  }

  // ── Create one-time claim (token NEVER goes in redirect URL) ─────────────
  const { data: claim, error: claimErr } = await supabase
    .from('oauth_claims')
    .insert({
      user_id:    userId,
      platform:   'shopify',
      payload:    {
        access_token: accessToken,
        shop,
        shop_name: shopName,
      },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (claimErr || !claim) {
    console.error('[shopify-oauth] oauth_claims insert failed:', claimErr?.message)
    return redirectTo(APP_URL, returnPage, { shopify_error: 'internal_error' })
  }

  // ── Redirect back to the app with claim code and nonce only ─────────────
  return redirectTo(APP_URL, returnPage, {
    shopify_connected: '1',
    claim:             claim.id as string,
    nonce,
  })
})
