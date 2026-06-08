/**
 * Ephermal — Google Ads OAuth Callback (Supabase Edge Function)
 *
 * Triggered by Google after the user grants permission.
 * Exchanges the authorization code for access + refresh tokens using
 * GOOGLE_CLIENT_SECRET (server-side only — never exposed to browser).
 *
 * Deploy: supabase functions deploy google-oauth-callback
 *
 * Required secrets (supabase secrets set KEY=value):
 *   GOOGLE_CLIENT_ID          — from Google Cloud Console → Credentials (OAuth 2.0 Client ID)
 *   GOOGLE_CLIENT_SECRET      — same location (NEVER put in frontend code)
 *   GOOGLE_CALLBACK_URL       — this function's public URL:
 *                               https://<project-ref>.supabase.co/functions/v1/google-oauth-callback
 *   GOOGLE_ADS_DEVELOPER_TOKEN — from Google Ads → Tools → API Center (optional at first)
 *   APP_URL                   — https://ephermal.app
 *
 * Auto-injected by Supabase (no action needed):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Google Cloud Console setup required:
 *   APIs & Services → Credentials → OAuth 2.0 Client → Authorized Redirect URIs
 *   Add: https://<project-ref>.supabase.co/functions/v1/google-oauth-callback
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

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Only GET — this is a browser redirect from Google
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url     = new URL(req.url)
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://ephermal.app'
  const code    = url.searchParams.get('code')
  const state   = url.searchParams.get('state') ?? ''
  const error   = url.searchParams.get('error')

  // ── User declined or Google error ────────────────────────────────────────
  if (error) {
    console.warn('[google-oauth] User declined or error:', error)
    return redirectTo(APP_URL, 'setup.html', { google_error: 'access_denied' })
  }

  if (!code || !state) {
    return redirectTo(APP_URL, 'setup.html', { google_error: 'missing_params' })
  }

  // ── Parse & validate state: format is userId~page~nonce~hmac ─────────────
  const parts      = state.split('~')
  const userId     = parts[0] ?? ''
  const sourcePage = parts[1] ?? ''
  const nonce      = parts[2] ?? ''
  const hmac       = parts[3] ?? ''

  if (!userId || !nonce || !hmac || !['setup', 'dashboard'].includes(sourcePage)) {
    return redirectTo(APP_URL, 'setup.html', { google_error: 'invalid_state' })
  }

  const returnPage: 'setup.html' | 'dashboard.html' =
    sourcePage === 'dashboard' ? 'dashboard.html' : 'setup.html'

  // ── Verify HMAC — ensures userId was set by an authenticated server call ─
  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET') ?? ''
  if (!stateSecret) {
    console.error('[google-oauth] OAUTH_STATE_SECRET not configured')
    return redirectTo(APP_URL, returnPage, { google_error: 'server_config_error' })
  }
  const expectedHmac = await signOAuthState(stateSecret, userId, 'google', sourcePage, nonce)
  if (!timingSafeEqualHex(expectedHmac, hmac)) {
    console.error('[google-oauth] State HMAC verification failed')
    return redirectTo(APP_URL, 'setup.html', { google_error: 'invalid_state' })
  }

  // ── Read secrets ──────────────────────────────────────────────────────────
  const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const GOOGLE_CALLBACK_URL  = Deno.env.get('GOOGLE_CALLBACK_URL')
  const DEVELOPER_TOKEN      = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? ''

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    console.error('[google-oauth] Missing required env vars')
    return redirectTo(APP_URL, returnPage, { google_error: 'server_config_error' })
  }

  // ── Exchange authorization code for tokens ────────────────────────────────
  let accessToken: string
  let refreshToken: string | null = null

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_CALLBACK_URL,
        grant_type:    'authorization_code',
      }).toString(),
    })

    const tokenData = await tokenRes.json()

    if (tokenData.error || !tokenData.access_token) {
      console.error('[google-oauth] Token exchange failed:', JSON.stringify(tokenData.error))
      return redirectTo(APP_URL, returnPage, { google_error: 'auth_failed' })
    }

    accessToken  = tokenData.access_token as string
    refreshToken = (tokenData.refresh_token as string | undefined) ?? null

    if (!refreshToken) {
      // This happens if user already authorized and prompt=consent wasn't set.
      // Non-fatal — we can still proceed if a refresh token is already stored.
      console.warn('[google-oauth] No refresh_token in response (user may have already authorized)')
    }
  } catch (e) {
    console.error('[google-oauth] Token exchange fetch threw:', e)
    return redirectTo(APP_URL, returnPage, { google_error: 'network_error' })
  }

  // ── Fetch accessible Google Ads customer IDs (requires developer token) ───
  let customerId: string | null = null
  let customerIds: string[]     = []

  if (DEVELOPER_TOKEN) {
    try {
      const custRes  = await fetch(
        'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
        {
          headers: {
            'Authorization':   `Bearer ${accessToken}`,
            'developer-token': DEVELOPER_TOKEN,
          },
        },
      )
      const custData = await custRes.json()

      // resourceNames are like "customers/1234567890"
      if (Array.isArray(custData.resourceNames)) {
        customerIds = (custData.resourceNames as string[]).map(r => r.replace('customers/', ''))
        customerId  = customerIds[0] ?? null
      }
    } catch (e) {
      console.warn('[google-oauth] Customer IDs fetch threw (non-fatal):', e)
    }
  }

  // ── Persist to Supabase (service role bypasses RLS) ───────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Build the upsert object — only update refresh_token if we got one
  const upsertData: Record<string, string | null> = {
    user_id: userId,
  }
  if (refreshToken)  upsertData.google_refresh_token   = refreshToken
  if (customerId)    upsertData.google_ads_customer_id = customerId

  const { error: upsertErr } = await supabase
    .from('user_integrations')
    .upsert(upsertData, { onConflict: 'user_id' })

  if (upsertErr) {
    console.error('[google-oauth] user_integrations upsert failed:', upsertErr.message)
  }

  // ── Create one-time claim (tokens NEVER go in redirect URL) ───────────────
  const { data: claim, error: claimErr } = await supabase
    .from('oauth_claims')
    .insert({
      user_id:    userId,
      platform:   'google',
      payload:    {
        customer_id:  customerId,
        customer_ids: customerIds,
        has_refresh_token: refreshToken !== null,
      },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (claimErr || !claim) {
    console.error('[google-oauth] oauth_claims insert failed:', claimErr?.message)
    return redirectTo(APP_URL, returnPage, { google_error: 'internal_error' })
  }

  // ── Redirect back with claim code and nonce only ─────────────────────────
  return redirectTo(APP_URL, returnPage, {
    google_connected: '1',
    claim:            claim.id as string,
    nonce,
  })
})
