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

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v17'

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

/** Exchange refresh token for a fresh access token */
async function getAccessToken(refreshToken: string): Promise<string> {
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

  const data = await res.json()
  if (data.error || !data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description ?? data.error ?? 'unknown'}`)
  }
  return data.access_token as string
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

  const userId = extractUserId(req.headers.get('Authorization'))
  if (!userId) return errResponse('Unauthorized', 401, origin)

  const devToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
  if (!devToken) return errResponse('Google Ads developer token not configured', 503, origin)

  const creds = await getCredentials(userId)
  if (!creds) return errResponse('Google Ads not connected. Connect in Settings.', 403, origin)

  const url    = new URL(req.url)
  const action = req.method === 'GET'
    ? (url.searchParams.get('action') ?? 'campaigns')
    : String(((await req.json().catch(() => ({}))).action) ?? '')

  let accessToken: string
  try {
    accessToken = await getAccessToken(creds.refreshToken)
  } catch (e) {
    console.error('[google-api] Token refresh failed:', e)
    return errResponse('Google token refresh failed — please reconnect Google Ads', 401, origin)
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
            metrics.conversion_value,
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
          const c = r.campaign as Record<string, unknown>
          const b = r.campaign_budget as Record<string, unknown>
          const m = r.metrics as Record<string, unknown>
          const spend       = Number(m?.cost_micros ?? 0) / 1_000_000
          const convValue   = Number(m?.conversion_value ?? 0)
          const conversions = Number(m?.conversions ?? 0)
          return {
            id:           String(c?.id ?? ''),
            name:         String(c?.name ?? ''),
            status:       String(c?.status ?? 'UNKNOWN').toLowerCase(),
            platform:     'google',
            channel:      String(c?.advertising_channel_type ?? 'SEARCH'),
            daily_budget: Number(b?.amount_micros ?? 0) / 1_000_000,
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
            metrics.conversion_value,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr
          FROM customer
          WHERE segments.date DURING LAST_30_DAYS
        `)

        const totals = results.reduce(
          (acc, r) => {
            const m = r.metrics as Record<string, unknown>
            acc.spend       += Number(m?.cost_micros ?? 0) / 1_000_000
            acc.convValue   += Number(m?.conversion_value ?? 0)
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
        const body = await req.json().catch(() => ({})) as Record<string, unknown>
        const campaignId = String(body.campaign_id ?? '')
        const newStatus  = String(body.status ?? 'PAUSED')

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
        const body = await req.json().catch(() => ({})) as Record<string, unknown>
        const campaignId   = String(body.campaign_id ?? '')
        const budgetUsd    = Number(body.budget_usd ?? 0)

        if (!campaignId || budgetUsd < 1) {
          return errResponse('campaign_id and budget_usd (minimum 1) are required', 400, origin)
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

        const budgetResource = (budgetResults[0].campaign_budget as Record<string, unknown>)?.resource_name as string
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

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin)
    }
  } catch (err) {
    console.error('[google-api] error:', err)
    const msg = err instanceof Error ? err.message : 'Google Ads API error'
    return errResponse(msg, 500, origin)
  }
})
