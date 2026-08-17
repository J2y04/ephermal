/**
 * Ephermal — Google Ads API Edge Function
 *
 * Proxies Google Ads API calls server-side using the stored refresh token.
 * Never exposes credentials to the browser.
 *
 * Actions (GET ?action=... or POST { action: ... }):
 *   campaigns   — list campaigns with 30-day metrics
 *   insights    — account-level ROAS, spend, impressions, clicks
 *   toggle      — pause or enable a campaign  { campaign_id, status: 'PAUSED'|'ENABLED' }
 *   budget      — update daily budget          { campaign_id, budget_micros }
 *
 * Deploy: supabase functions deploy google-api
 *
 * Required secrets:
 *   GOOGLE_CLIENT_ID             — OAuth 2.0 client ID
 *   GOOGLE_CLIENT_SECRET         — OAuth 2.0 client secret
 *   GOOGLE_ADS_DEVELOPER_TOKEN   — from Google Ads → Tools → API Center
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts'
import { redis, redisAvailable } from '../_shared/redis.ts'
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts'
import { requirePlan } from '../_shared/plan.ts'

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v24'

// Same absolute daily-budget ceiling budget-ai.ts applies before pushing a budget live
// (MAX_DAILY_BUDGET_USD = 10000) — this endpoint had only a $1 floor, no ceiling.
const MAX_DAILY_BUDGET_USD = 10000

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface GoogleCreds {
  refreshToken: string
  customerId:   string
}

/** Load stored Google credentials for the user */
async function getCredentials(userId: string): Promise<GoogleCreds | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('google_refresh_token, google_ads_customer_id')
    .eq('user_id', userId)
    .single()

  if (!data?.google_refresh_token || !data?.google_ads_customer_id) return null
  return {
    refreshToken: data.google_refresh_token as string,
    customerId:   data.google_ads_customer_id as string,
  }
}

/** Exchange refresh token for a fresh access token, cached in Redis for 55 min */
async function getAccessToken(refreshToken: string, userId: string): Promise<string> {
  const cacheKey = `google_token:${userId}`

  if (redisAvailable()) {
    const cached = await redis.get(cacheKey)
    if (cached) return cached
  }

  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
    }).toString(),
  })

  // Capture the raw body before assuming it parses as JSON — a non-2xx from
  // Google's token endpoint isn't guaranteed to be JSON (e.g. edge proxy errors,
  // malformed requests), and a bare "Unexpected token" parse error was less
  // useful than just showing what Google actually sent back.
  const rawBody = await res.text()
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(rawBody) } catch { /* fall through with raw text below */ }
  if (!res.ok || data.error || !data.access_token) {
    const detail = data.error_description ?? data.error ?? rawBody.slice(0, 200) ?? 'unknown'
    throw new Error(`Token refresh failed (HTTP ${res.status}): ${detail}`)
  }

  const token = data.access_token as string
  // Cache for 55 min (tokens are valid 60 min; 5 min buffer)
  if (redisAvailable()) await redis.set(cacheKey, token, 3300)
  return token
}

/** Execute a GAQL query against the Google Ads search endpoint */
async function gaqlSearch(
  customerId:   string,
  accessToken:  string,
  devToken:     string,
  query:        string,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${accessToken}`,
        'developer-token': devToken,
        'Content-Type':    'application/json',
      },
      body: JSON.stringify({ query }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(JSON.stringify((err as Record<string, unknown>).error ?? err))
  }

  const data = await res.json()
  return (data as { results?: Record<string, unknown>[] }).results ?? []
}

/** Mutate a Google Ads resource (campaign pause/enable/budget) */
async function gadsPost(
  customerId:  string,
  accessToken: string,
  devToken:    string,
  endpoint:    string,
  body:        unknown,
): Promise<unknown> {
  const res = await fetch(
    `${GOOGLE_ADS_API}/customers/${customerId}/${endpoint}`,
    {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${accessToken}`,
        'developer-token': devToken,
        'Content-Type':    'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(JSON.stringify((err as Record<string, unknown>).error ?? err))
  }
  return res.json()
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const authDiag: { reason?: string } = {}
  const userId = await extractUserId(req.headers.get('Authorization'), authDiag)
  if (!userId) {
    console.error('[google-api] auth rejected — reason:', authDiag.reason)
    return errResponse('Invalid or expired session', 401, origin, { reason: authDiag.reason ?? 'unknown' })
  }

  const gate = await requirePlan(userId, 'growth', origin, 'Google Ads management')
  if (gate) return gate

  const rl = await rateLimitTiered(userId, 'google-api', [
    { max: 20, window: 60 },
    { max: 120, window: 3600 },
  ])
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn)

  const devToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
  if (!devToken) return errResponse('Google Ads developer token not configured', 503, origin)

  const url = new URL(req.url)
  let postBody: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try { postBody = await req.json() } catch { /* empty body ok */ }
  }
  const action = req.method === 'GET'
    ? (url.searchParams.get('action') ?? 'campaigns')
    : String(postBody.action ?? '')

  // ── save_customer_id: persist a manually-entered Customer ID ─────────────────
  // Handled before the getCredentials() gate below, since this is precisely the
  // path used when OAuth granted a refresh token but couldn't auto-resolve a
  // customer ID (listAccessibleCustomers returned none) — at this point
  // google_ads_customer_id is genuinely still null, so the normal full-creds
  // gate would 403 before ever reaching this action. Previously the frontend
  // (dashSaveGoogleAccount()) only wrote this to localStorage and never called
  // any backend endpoint at all — the dashboard showed "Google Ads connected"
  // while the database (and every real campaign/API action) still had no
  // customer ID, so every subsequent Google Ads operation silently 403'd.
  if (action === 'save_customer_id') {
    const rawCid = String(postBody.customer_id ?? '').replace(/-/g, '')
    if (!/^\d{8,10}$/.test(rawCid)) {
      return errResponse('Customer ID must be 8-10 digits', 400, origin)
    }

    const { data: row } = await supabase
      .from('user_integrations')
      .select('google_refresh_token')
      .eq('user_id', userId)
      .single()
    const refreshToken = row?.google_refresh_token as string | undefined
    if (!refreshToken) return errResponse('Connect Google Ads via OAuth first, then add your Customer ID', 403, origin)

    // Connection checker: verify this customer ID is actually accessible to the
    // stored token before saving it — otherwise a typo or someone else's ID
    // would silently "connect" and only fail later on a real campaign action.
    let saveAccessToken: string
    try {
      saveAccessToken = await getAccessToken(refreshToken, userId)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      console.error('[google-api] save_customer_id token refresh failed:', detail)
      return errResponse(`Google token refresh failed - please reconnect Google Ads (${detail})`, 401, origin, { detail })
    }
    try {
      const custRes = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
        headers: { 'Authorization': `Bearer ${saveAccessToken}`, 'developer-token': devToken },
      })
      // v17 (hardcoded here until now) was sunset June 2025 - Google serves a 404 HTML
      // page for it, not a JSON error, so res.json() below would throw a confusing
      // "Unexpected token '<'" instead of ever reaching the real error-detail path.
      const rawCustBody = await custRes.text()
      let custData: Record<string, unknown> = {}
      try { custData = JSON.parse(rawCustBody) } catch { /* fall through with raw text below */ }
      if (!custRes.ok || custData.error) {
        const detail = JSON.stringify(custData.error ?? custData) || rawCustBody.slice(0, 300)
        console.error('[google-api] save_customer_id accessible-customers check failed:', custRes.status, detail)
        return errResponse(`Could not verify Google Ads access — please reconnect Google Ads (HTTP ${custRes.status}: ${detail.slice(0, 200)})`, 403, origin)
      }
      const accessibleIds = (Array.isArray(custData.resourceNames) ? custData.resourceNames as string[] : [])
        .map(r => r.replace('customers/', ''))
      if (!accessibleIds.includes(rawCid)) {
        return errResponse('That Customer ID is not accessible to your connected Google account. Double-check the ID.', 403, origin)
      }
    } catch (e) {
      console.error('[google-api] save_customer_id verification threw:', e)
      return errResponse('Could not verify Google Ads access — please try again', 502, origin)
    }

    const { error: updateErr } = await supabase
      .from('user_integrations')
      .update({ google_ads_customer_id: rawCid })
      .eq('user_id', userId)
    if (updateErr) {
      console.error('[google-api] save_customer_id DB update failed:', updateErr.message)
      return errResponse('Failed to save Customer ID', 500, origin)
    }
    return okResponse({ success: true, customer_id: rawCid }, origin)
  }

  const creds = await getCredentials(userId)
  if (!creds) return errResponse('Google Ads not connected. Connect in Settings.', 403, origin)

  let accessToken: string
  try {
    accessToken = await getAccessToken(creds.refreshToken, userId)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[google-api] Token refresh failed:', detail)
    return errResponse(`Google token refresh failed - please reconnect Google Ads (${detail})`, 401, origin, { detail })
  }

  const { customerId } = creds

  try {
    switch (action) {

      // ── campaigns: list campaigns with 30-day metrics ──────────────────────
      case 'campaigns': {
        const results = await gaqlSearch(customerId, accessToken, devToken, `
          SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            campaign.advertising_channel_type,
            campaign_budget.amount_micros,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr
          FROM campaign
          WHERE segments.date DURING LAST_30_DAYS
            AND campaign.status != 'REMOVED'
          ORDER BY metrics.cost_micros DESC
          LIMIT 50
        `)

        const campaigns = results.map((r: Record<string, unknown>) => {
          // Google's REST search response serializes fields as lowerCamelCase, not the
          // snake_case used in the GAQL query text itself (confirmed against Google's own
          // JSON-mapping docs) - reading r.campaign_budget/m.cost_micros etc. here silently
          // read undefined for every field with an underscore, so budget/spend/roas always
          // came back as 0 while id/name/status/conversions (no underscore in their real key)
          // happened to work by coincidence. mrr-tracker's own Google fetch already uses the
          // correct camelCase convention for the same API.
          const c = r.campaign as Record<string, unknown>
          const b = r.campaignBudget as Record<string, unknown>
          const m = r.metrics as Record<string, unknown>
          const spend       = Number(m?.costMicros ?? 0) / 1_000_000
          const convValue   = Number(m?.conversionsValue ?? 0)
          const conversions = Number(m?.conversions ?? 0)
          return {
            id:           String(c?.id ?? ''),
            name:         String(c?.name ?? ''),
            status:       String(c?.status ?? 'UNKNOWN').toLowerCase(),
            platform:     'google',
            channel:      String(c?.advertisingChannelType ?? 'SEARCH'),
            daily_budget: Number(b?.amountMicros ?? 0) / 1_000_000,
            total_spend:  spend,
            roas:         spend > 0 ? parseFloat((convValue / spend).toFixed(2)) : 0,
            conversions,
            impressions:  Number(m?.impressions ?? 0),
            clicks:       Number(m?.clicks ?? 0),
            ctr:          parseFloat((Number(m?.ctr ?? 0) * 100).toFixed(2)),
          }
        })

        return okResponse({ campaigns }, origin)
      }

      // ── insights: account-level ROAS summary ──────────────────────────────
      case 'insights': {
        const results = await gaqlSearch(customerId, accessToken, devToken, `
          SELECT
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr
          FROM customer
          WHERE segments.date DURING LAST_30_DAYS
        `)

        const totals = results.reduce(
          (acc, r) => {
            const m = r.metrics as Record<string, unknown>
            acc.spend       += Number(m?.costMicros ?? 0) / 1_000_000
            acc.convValue   += Number(m?.conversionsValue ?? 0)
            acc.conversions += Number(m?.conversions ?? 0)
            acc.impressions += Number(m?.impressions ?? 0)
            acc.clicks      += Number(m?.clicks ?? 0)
            return acc
          },
          { spend: 0, convValue: 0, conversions: 0, impressions: 0, clicks: 0 },
        )

        return okResponse({
          spend:       parseFloat(totals.spend.toFixed(2)),
          roas:        totals.spend > 0 ? parseFloat((totals.convValue / totals.spend).toFixed(2)) : 0,
          conversions: totals.conversions,
          impressions: totals.impressions,
          clicks:      totals.clicks,
          ctr:         totals.clicks > 0
            ? parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2))
            : 0,
        }, origin)
      }

      // ── toggle: pause or enable a campaign ────────────────────────────────
      case 'toggle': {
        const campaignId = String(postBody.campaign_id ?? '')
        const newStatus  = String(postBody.status ?? 'PAUSED')

        if (!campaignId || !['PAUSED', 'ENABLED'].includes(newStatus)) {
          return errResponse('campaign_id and status (PAUSED|ENABLED) are required', 400, origin)
        }
        if (!/^\d+$/.test(campaignId)) {
          return errResponse('campaign_id must be numeric', 400, origin)
        }

        await gadsPost(customerId, accessToken, devToken, 'campaigns:mutate', {
          operations: [{
            update: {
              resourceName: `customers/${customerId}/campaigns/${campaignId}`,
              status:       newStatus,
            },
            updateMask: 'status',
          }],
        })

        return okResponse({ success: true, campaign_id: campaignId, status: newStatus }, origin)
      }

      // ── budget: update campaign daily budget ─────────────────────────────
      case 'budget': {
        const campaignId = String(postBody.campaign_id ?? '')
        const budgetUsd  = Number(postBody.budget_usd ?? 0)

        if (!campaignId || !Number.isFinite(budgetUsd) || budgetUsd < 1) {
          return errResponse('campaign_id and budget_usd (minimum 1) are required', 400, origin)
        }

        if (budgetUsd > MAX_DAILY_BUDGET_USD) {
          return errResponse(`budget_usd must be at most $${MAX_DAILY_BUDGET_USD}/day`, 400, origin)
        }

        // Validate campaignId is numeric before interpolating into GAQL
        if (!/^\d+$/.test(campaignId)) {
          return errResponse('campaign_id must be numeric', 400, origin)
        }

        // First get the campaign's budget resource name
        const budgetResults = await gaqlSearch(customerId, accessToken, devToken, `
          SELECT campaign_budget.resource_name, campaign_budget.id
          FROM campaign
          WHERE campaign.id = ${campaignId}
          LIMIT 1
        `)

        if (!budgetResults.length) {
          return errResponse('Campaign not found', 404, origin)
        }

        // Same camelCase-vs-snake_case mismatch as the campaigns/insights actions above -
        // this always evaluated to undefined and the action always 500'd, on every call.
        const budgetResource = (budgetResults[0].campaignBudget as Record<string, unknown>)?.resourceName as string
        if (!budgetResource) return errResponse('Could not resolve campaign budget', 500, origin)

        await gadsPost(customerId, accessToken, devToken, 'campaignBudgets:mutate', {
          operations: [{
            update: {
              resourceName:  budgetResource,
              amountMicros:  Math.round(budgetUsd * 1_000_000),
            },
            updateMask: 'amountMicros',
          }],
        })

        return okResponse({ success: true, campaign_id: campaignId, budget_usd: budgetUsd }, origin)
      }

      // ── create: build a PAUSED Search campaign from AI-generated copy ────────
      case 'create': {
        const campaignName   = String(postBody.campaign_name   ?? 'Ephermal Campaign')
        const budgetUsd      = Number(postBody.budget_daily    ?? 20)
        const keywords       = (postBody.keywords       as string[] | undefined) ?? []
        const headlines      = (postBody.headlines      as string[] | undefined) ?? []
        const descriptions   = (postBody.descriptions   as string[] | undefined) ?? []
        const adGroupName    = String(postBody.ad_group_name ?? `${campaignName} — Ad Group`)

        // 1. Campaign budget
        const budgetResult = await gadsPost(customerId, accessToken, devToken, 'campaignBudgets:mutate', {
          operations: [{
            create: {
              name:           `${campaignName} Budget`,
              amountMicros:   String(Math.round(budgetUsd * 1_000_000)),
              deliveryMethod: 'STANDARD',
            },
          }],
        }) as { results: { resourceName: string }[] }

        const budgetRn = budgetResult.results?.[0]?.resourceName
        if (!budgetRn) throw new Error('Failed to create campaign budget')

        // 2. Campaign
        const campaignResult = await gadsPost(customerId, accessToken, devToken, 'campaigns:mutate', {
          operations: [{
            create: {
              name:                   campaignName,
              advertisingChannelType: 'SEARCH',
              status:                 'PAUSED',
              campaignBudget:         budgetRn,
              biddingStrategyType:    'MAXIMIZE_CONVERSIONS',
              networkSettings: {
                targetGoogleSearch:   true,
                targetSearchNetwork:  true,
                targetContentNetwork: false,
              },
            },
          }],
        }) as { results: { resourceName: string }[] }

        const campaignRn = campaignResult.results?.[0]?.resourceName
        if (!campaignRn) throw new Error('Failed to create campaign')
        const googleCampaignId = campaignRn.split('/').pop()!

        // 3. Ad group
        const adGroupResult = await gadsPost(customerId, accessToken, devToken, 'adGroups:mutate', {
          operations: [{
            create: {
              name:         adGroupName,
              campaign:     campaignRn,
              status:       'ENABLED',
              type:         'SEARCH_STANDARD',
              cpcBidMicros: '1000000',
            },
          }],
        }) as { results: { resourceName: string }[] }

        const adGroupRn = adGroupResult.results?.[0]?.resourceName

        // 4. Keywords
        if (adGroupRn && keywords.length > 0) {
          await gadsPost(customerId, accessToken, devToken, 'adGroupCriteria:mutate', {
            operations: keywords.slice(0, 20).map((kw: string) => ({
              create: {
                adGroup: adGroupRn,
                keyword: { text: kw.slice(0, 80), matchType: 'BROAD' },
                status:  'ENABLED',
              },
            })),
          })
        }

        // 5. Responsive Search Ad
        if (adGroupRn && headlines.length >= 3 && descriptions.length >= 2) {
          await gadsPost(customerId, accessToken, devToken, 'adGroupAds:mutate', {
            operations: [{
              create: {
                adGroup: adGroupRn,
                status:  'PAUSED',
                ad: {
                  responsiveSearchAd: {
                    headlines:    headlines.slice(0, 15).map((h: string) => ({ text: h.slice(0, 30) })),
                    descriptions: descriptions.slice(0, 4).map((d: string) => ({ text: d.slice(0, 90) })),
                  },
                },
              },
            }],
          })
        }

        return okResponse({
          google_campaign_id: googleCampaignId,
          campaign_resource:  campaignRn,
          budget_resource:    budgetRn,
          ad_group_resource:  adGroupRn,
          status:             'PAUSED',
          note:               'Google Search campaign created as PAUSED. Enable in Google Ads Manager.',
        }, origin)
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin)
    }
  } catch (err) {
    console.error('[google-api] error:', err)
    // gaqlSearch/gadsPost already embed the real Google Ads error (code, message) in err.message —
    // discarding it here for a generic string, unlike meta-api/shopify-api's equivalent catches,
    // made every failure (permission denied, invalid argument, auth) look identical to the caller.
    const msg = err instanceof Error ? err.message : 'Google Ads API error'
    // A manager (MCC) account has no campaigns/metrics of its own - Google rejects every
    // campaigns/insights read with this exact query error. campaign-launcher already detects
    // this before campaign creation and shows a clear message; campaigns/insights (read paths,
    // called on every dashboard load) had no equivalent, so this surfaced as an opaque 500 on
    // every page load instead of telling the user what to actually do about it.
    if (msg.includes('REQUESTED_METRICS_FOR_MANAGER')) {
      return errResponse(
        'Your connected Google Ads customer ID is a manager (MCC) account, which has no campaigns or metrics of its own. Reconnect in Settings using the specific client account ID you actually advertise from, not the manager account.',
        403,
        origin,
      )
    }
    return errResponse(msg, 500, origin)
  }
})
