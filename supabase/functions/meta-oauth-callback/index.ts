/**
 * Ephermal — Meta Ads OAuth Callback (Supabase Edge Function)
 *
 * Triggered by Meta after the user grants permission.
 * Exchanges the authorization code for an access token using
 * META_APP_SECRET (server-side only — never exposed to the browser).
 *
 * Deploy: supabase functions deploy meta-oauth-callback
 *
 * Required secrets (supabase secrets set KEY=value):
 *   META_APP_ID          — from Meta App Dashboard → Settings → Basic
 *   META_APP_SECRET      — same location (NEVER put in frontend code)
 *   META_CALLBACK_URL    — this function's public URL
 *                          https://<project-ref>.supabase.co/functions/v1/meta-oauth-callback
 *   APP_URL              — https://ephermal.app
 *
 * Auto-injected by Supabase (no action needed):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { signOAuthState, timingSafeEqualHex } from '../_shared/auth.ts'
import { rateLimitIp } from '../_shared/rate-limit.ts'
import { captureError } from '../_shared/sentry.ts';

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
  // Only GET — this is a browser redirect from Meta
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Unauthenticated endpoint - every request still does state parsing, an HMAC computation,
  // and (past that) a DB round-trip and a real token-exchange call to Meta for near-miss
  // values. IP-scoped, not user-scoped, since there's no authenticated identity yet.
  const rl = await rateLimitIp(req, 'meta-oauth-callback', 20, 60)
  if (!rl.allowed) return new Response('Too many requests', { status: 429 })

  const url     = new URL(req.url)
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://ephermal.app'
  const code    = url.searchParams.get('code')
  const state   = url.searchParams.get('state') ?? ''
  const error   = url.searchParams.get('error')

  // ── User declined or Meta error ──────────────────────────────────────────
  if (error) {
    return redirectTo(APP_URL, 'setup.html', { meta_error: 'access_denied' })
  }

  if (!code || !state) {
    return redirectTo(APP_URL, 'setup.html', { meta_error: 'missing_params' })
  }

  // ── Parse & validate state: format is userId~page~nonce~hmac ────────────
  const parts      = state.split('~')
  const userId     = parts[0] ?? ''
  const sourcePage = parts[1] ?? ''
  const nonce      = parts[2] ?? ''
  const hmac       = parts[3] ?? ''

  if (!userId || !nonce || !hmac || !['setup', 'dashboard'].includes(sourcePage)) {
    return redirectTo(APP_URL, 'setup.html', { meta_error: 'invalid_state' })
  }

  const returnPage: 'setup.html' | 'dashboard.html' =
    sourcePage === 'dashboard' ? 'dashboard.html' : 'setup.html'

  // ── Verify HMAC — ensures userId was set by an authenticated server call ─
  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET') ?? ''
  if (!stateSecret) {
    captureError('meta-oauth-callback', '[meta-oauth] OAUTH_STATE_SECRET not configured')
    return redirectTo(APP_URL, returnPage, { meta_error: 'server_config_error' })
  }
  const expectedHmac = await signOAuthState(stateSecret, userId, 'meta', sourcePage, nonce)
  if (!timingSafeEqualHex(expectedHmac, hmac)) {
    captureError('meta-oauth-callback', '[meta-oauth] State HMAC verification failed')
    return redirectTo(APP_URL, 'setup.html', { meta_error: 'invalid_state' })
  }

  // ── Consume the nonce (single-use) — rejects replay of a captured state ──
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: consumedNonce } = await supabase
    .from('oauth_nonces')
    .delete()
    .eq('nonce', nonce)
    .eq('user_id', userId)
    .eq('platform', 'meta')
    .gt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .select('nonce')
  if (!consumedNonce || consumedNonce.length === 0) {
    captureError('meta-oauth-callback', '[meta-oauth] Nonce already used, unknown, or expired')
    return redirectTo(APP_URL, 'setup.html', { meta_error: 'invalid_state' })
  }

  // ── Read secrets from Supabase Vault ────────────────────────────────────
  const META_APP_ID       = Deno.env.get('META_APP_ID')
  const META_APP_SECRET   = Deno.env.get('META_APP_SECRET')
  const META_CALLBACK_URL = Deno.env.get('META_CALLBACK_URL')

  if (!META_APP_ID || !META_APP_SECRET || !META_CALLBACK_URL) {
    captureError('meta-oauth-callback', '[meta-oauth] Missing required env vars')
    return redirectTo(APP_URL, returnPage, { meta_error: 'server_config_error' })
  }

  // ── Exchange authorization code for access token ─────────────────────────
  let accessToken: string
  try {
    const tokenRes = await fetch(
      'https://graph.facebook.com/v19.0/oauth/access_token' +
        `?client_id=${encodeURIComponent(META_APP_ID)}` +
        `&redirect_uri=${encodeURIComponent(META_CALLBACK_URL)}` +
        `&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
        `&code=${encodeURIComponent(code)}`,
    )
    const tokenData = await tokenRes.json()

    if (tokenData.error || !tokenData.access_token) {
      // Log detail server-side; return generic error to browser
      captureError('meta-oauth-callback', '[meta-oauth] Token exchange failed:', JSON.stringify(tokenData.error))
      return redirectTo(APP_URL, returnPage, { meta_error: 'auth_failed' })
    }
    accessToken = tokenData.access_token as string
  } catch (e) {
    captureError('meta-oauth-callback', '[meta-oauth] Token exchange fetch threw:', e)
    return redirectTo(APP_URL, returnPage, { meta_error: 'network_error' })
  }

  // ── Exchange for a long-lived token (~60 days) ───────────────────────────
  // The code exchange above returns a SHORT-lived user token (1-2 hours). Without this second
  // exchange, every connected account would silently expire within hours and repeatedly prompt
  // "reconnect Meta" - exactly what non-technical Shopify store owners hit, when the whole point
  // of connecting once is that it stays connected. Per Meta's own docs
  // (https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived),
  // this is a GET with grant_type=fb_exchange_token using the same app credentials. Best-effort:
  // if it fails for any reason, fall back to the short-lived token rather than blocking the
  // connection entirely - the user will just need to reconnect sooner.
  try {
    const longLivedRes = await fetch(
      'https://graph.facebook.com/v19.0/oauth/access_token' +
        `?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(META_APP_ID)}` +
        `&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
        `&fb_exchange_token=${encodeURIComponent(accessToken)}`,
    )
    const longLivedData = await longLivedRes.json()
    if (longLivedRes.ok && longLivedData.access_token) {
      accessToken = longLivedData.access_token as string
    } else {
      captureError('meta-oauth-callback', '[meta-oauth] Long-lived token exchange failed, using short-lived token:', JSON.stringify(longLivedData.error ?? longLivedData))
    }
  } catch (e) {
    captureError('meta-oauth-callback', '[meta-oauth] Long-lived token exchange threw, using short-lived token:', e)
  }

  // ── Connection checker: prove the fresh token can actually reach the Meta ──
  // Graph API before we store it or tell the user they're connected. A 2xx
  // response with zero accounts is a legitimate state for a brand-new ad
  // account (not a failure) — only a non-2xx status or a body-level `error`
  // (bad/expired/under-scoped token) aborts the connection.
  let accounts: Array<{ id: string; name: string }> = []
  try {
    const accRes  = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id&limit=50`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } },
    )
    const accData = await accRes.json()
    if (!accRes.ok || accData.error) {
      captureError('meta-oauth-callback', '[meta-oauth] Connection test failed:', accRes.status, JSON.stringify(accData.error ?? accData))
      return redirectTo(APP_URL, returnPage, { meta_error: 'connection_test_failed' })
    }
    accounts = (accData.data ?? []).map((a: any) => ({
      id:   a.id   as string,
      name: a.name as string,
    }))
  } catch (e) {
    captureError('meta-oauth-callback', '[meta-oauth] Ad accounts fetch threw:', e)
    return redirectTo(APP_URL, returnPage, { meta_error: 'connection_test_failed' })
  }

  // ── Fetch the user's Facebook Pages (needed to create real ad creatives) ──
  // Requires the pages_show_list scope. Each page comes with its own access
  // token — that page token (not the user token) is what Meta expects when
  // building an ad creative's object_story_spec.
  let pages: Array<{ id: string; name: string; access_token: string }> = []
  try {
    const pageRes  = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=name,access_token&limit=50`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } },
    )
    const pageData = await pageRes.json()
    pages = (pageData.data ?? []).map((p: any) => ({
      id:           p.id           as string,
      name:         p.name         as string,
      access_token: p.access_token as string,
    }))
  } catch (e) {
    captureError('meta-oauth-callback', '[meta-oauth] Pages fetch threw:', e)
    // Non-fatal — ad launches will fall back to campaign+adset only until a page is connected
  }

  // ── Persist token to Supabase (service role bypasses RLS) ────────────────
  const { error: upsertErr } = await supabase
    .from('user_integrations')
    .upsert(
      {
        user_id:         userId,
        meta_token:      accessToken,
        meta_account:    accounts[0]?.id ?? null,
        meta_page_id:    pages[0]?.id ?? null,
        meta_page_name:  pages[0]?.name ?? null,
        meta_page_token: pages[0]?.access_token ?? null,
      },
      { onConflict: 'user_id' },
    )
  if (upsertErr) {
    captureError('meta-oauth-callback', '[meta-oauth] user_integrations upsert failed:', upsertErr.message)
  }

  // ── Create one-time claim (token NEVER goes in redirect URL) ─────────────
  // Claim expires in 5 minutes and is single-use.
  const { data: claim, error: claimErr } = await supabase
    .from('oauth_claims')
    .insert({
      user_id:    userId,
      platform:   'meta',
      payload:    {
        access_token:  accessToken,
        account_id:    accounts[0]?.id   ?? null,
        account_name:  accounts[0]?.name ?? null,
        accounts,
        page_id:       pages[0]?.id   ?? null,
        page_name:     pages[0]?.name ?? null,
      },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (claimErr || !claim) {
    captureError('meta-oauth-callback', '[meta-oauth] oauth_claims insert failed:', claimErr?.message)
    return redirectTo(APP_URL, returnPage, { meta_error: 'internal_error' })
  }

  // ── Redirect back to the app with claim code and nonce only ─────────────
  return redirectTo(APP_URL, returnPage, {
    meta_connected: '1',
    claim:          claim.id as string,
    nonce,
  })
})
