/**
 * Ephermal — MRR Tracker (Supabase Edge Function)
 *
 * Combines Shopify revenue, Meta ad spend, and Google Ads spend into one daily
 * time series per user — the unified "all marketing + revenue in one place" view.
 *
 * POST { action: 'sync' }        — pull last 90 days from Shopify/Meta/Google, upsert snapshots
 * POST { action: 'get_report' }  — return MRR, blended ROAS, MoM growth, and the daily series
 *
 * Required env vars:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN (optional — Google spend)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';
import { metaGet, parseConversions } from '../_shared/meta.ts';

const SHOPIFY_API_VERSION = '2025-07';
const SYNC_DAYS = 90;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** date_start (YYYY-MM-DD) → revenue/spend cents, keyed map */
type DailyMap = Map<string, number>;

function addTo(map: DailyMap, date: string, cents: number) {
  map.set(date, (map.get(date) ?? 0) + cents);
}

// ── Shopify: daily revenue + order count ─────────────────────────────────────
async function fetchShopifyDaily(userId: string): Promise<{ revenue: DailyMap; orders: DailyMap }> {
  const revenue: DailyMap = new Map();
  const orders: DailyMap = new Map();

  const { data: creds } = await supabase
    .from('user_integrations')
    .select('shopify_token, shopify_shop')
    .eq('user_id', userId)
    .maybeSingle();
  const token = creds?.shopify_token as string | undefined;
  const shop  = creds?.shopify_shop as string | undefined;
  if (!token || !shop) return { revenue, orders };

  const createdMin = `${isoDaysAgo(SYNC_DAYS)}T00:00:00Z`;
  let pageInfo: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string> = {
      limit: '250',
      status: 'any',
      financial_status: 'paid',
      fields: 'created_at,total_price',
      created_at_min: createdMin,
    };
    if (pageInfo) { params.page_info = pageInfo; delete params.created_at_min; delete params.financial_status; delete params.status; }
    const url = new URL(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders.json`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    });
    if (!res.ok) break;

    const data = await res.json() as { orders: { created_at: string; total_price: string }[] };
    for (const o of data.orders ?? []) {
      const date = o.created_at.slice(0, 10);
      const cents = Math.round(parseFloat(o.total_price || '0') * 100);
      addTo(revenue, date, cents);
      addTo(orders, date, 1);
    }

    const linkHeader = res.headers.get('link') ?? '';
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) { pageInfo = decodeURIComponent(nextMatch[1]); } else { hasMore = false; }
  }

  return { revenue, orders };
}

// ── Meta: daily spend ─────────────────────────────────────────────────────────
async function fetchMetaDaily(userId: string): Promise<{ spend: DailyMap; conversions: DailyMap }> {
  const spend: DailyMap = new Map();
  const conversions: DailyMap = new Map();
  const { data: creds } = await supabase
    .from('user_integrations')
    .select('meta_token, meta_account')
    .eq('user_id', userId)
    .maybeSingle();
  const token     = creds?.meta_token as string | undefined;
  const accountId = creds?.meta_account as string | undefined;
  if (!token || !accountId) return { spend, conversions };

  try {
    const data = await metaGet<{ data: { spend?: string; date_start: string; actions?: { action_type: string; value: string }[] }[] }>(
      `/${accountId}/insights`,
      {
        time_increment: '1',
        time_range: JSON.stringify({ since: isoDaysAgo(SYNC_DAYS), until: isoDaysAgo(0) }),
        fields: 'spend,date_start,actions',
        level: 'account',
      },
      token,
    );
    for (const row of data.data ?? []) {
      addTo(spend, row.date_start, Math.round(parseFloat(row.spend ?? '0') * 100));
      addTo(conversions, row.date_start, parseConversions(row.actions ?? []));
    }
  } catch (e) {
    console.error('mrr-tracker meta fetch error:', e);
  }
  return { spend, conversions };
}

// ── Google Ads: daily spend ───────────────────────────────────────────────────
async function fetchGoogleDaily(userId: string): Promise<{ spend: DailyMap; conversions: DailyMap }> {
  const spend: DailyMap = new Map();
  const conversions: DailyMap = new Map();
  const { data: creds } = await supabase
    .from('user_integrations')
    .select('google_refresh_token, google_ads_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  const refreshToken = creds?.google_refresh_token as string | undefined;
  const customerId   = creds?.google_ads_customer_id as string | undefined;
  const devToken      = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '';
  if (!refreshToken || !customerId || !devToken) return { spend, conversions };

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
        grant_type:    'refresh_token',
      }).toString(),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) return { spend, conversions };

    const GADS = 'https://googleads.googleapis.com/v24';
    const res = await fetch(`${GADS}/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${tokenData.access_token}`,
        'developer-token': devToken,
        'Content-Type':    'application/json',
      },
      body: JSON.stringify({
        query: `SELECT segments.date, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date DURING LAST_90_DAYS`,
      }),
    });
    if (!res.ok) return { spend, conversions };
    const data = await res.json() as { results?: { segments?: { date?: string }; metrics?: { costMicros?: string; conversions?: string } }[] };
    for (const row of data.results ?? []) {
      const date = row.segments?.date;
      const micros = Number(row.metrics?.costMicros ?? 0);
      if (date) {
        addTo(spend, date, Math.round(micros / 10000)); // micros → cents
        addTo(conversions, date, Math.round(Number(row.metrics?.conversions ?? 0)));
      }
    }
  } catch (e) {
    console.error('mrr-tracker google fetch error:', e);
  }
  return { spend, conversions };
}

async function handleSync(userId: string): Promise<Record<string, unknown>> {
  const [{ revenue, orders }, meta, google] = await Promise.all([
    fetchShopifyDaily(userId),
    fetchMetaDaily(userId),
    fetchGoogleDaily(userId),
  ]);

  const allDates = new Set<string>([...revenue.keys(), ...meta.spend.keys(), ...google.spend.keys()]);
  // Ensure every day in the window has a row, even if all-zero, so the chart has a continuous axis
  for (let i = 0; i < SYNC_DAYS; i++) allDates.add(isoDaysAgo(i));

  const rows = [...allDates].map(date => ({
    user_id:               userId,
    snapshot_date:         date,
    shopify_revenue_cents: revenue.get(date) ?? 0,
    shopify_orders_count:  orders.get(date) ?? 0,
    meta_spend_cents:      meta.spend.get(date) ?? 0,
    google_spend_cents:    google.spend.get(date) ?? 0,
    conversions:           (meta.conversions.get(date) ?? 0) + (google.conversions.get(date) ?? 0),
    updated_at:            new Date().toISOString(),
  }));

  if (rows.length > 0) {
    await supabase.from('revenue_snapshots').upsert(rows, { onConflict: 'user_id,snapshot_date' });
  }

  return {
    synced_days:      rows.length,
    shopify_connected: revenue.size > 0 || orders.size > 0,
    meta_connected:    meta.spend.size > 0,
    google_connected:  google.spend.size > 0,
  };
}

async function handleGetReport(userId: string): Promise<Record<string, unknown>> {
  const since = isoDaysAgo(SYNC_DAYS);
  const { data: rows } = await supabase
    .from('revenue_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });

  const snapshots = rows ?? [];
  if (snapshots.length === 0) {
    return { has_data: false, series: [], mrr_cents: 0, prev_mrr_cents: 0, mrr_growth_pct: null, total_spend_cents: 0, blended_roas: null };
  }

  const series = snapshots.map(r => {
    const spend = (r.meta_spend_cents ?? 0) + (r.google_spend_cents ?? 0);
    return {
      date:           r.snapshot_date,
      revenue_cents:  r.shopify_revenue_cents ?? 0,
      spend_cents:    spend,
      orders:         r.shopify_orders_count ?? 0,
      conversions:    r.conversions ?? 0,
      roas:           spend > 0 ? Math.round(((r.shopify_revenue_cents ?? 0) / spend) * 100) / 100 : null,
    };
  });

  const last30 = series.slice(-30);
  const prev30 = series.slice(-60, -30);

  const sum = (arr: typeof series, key: 'revenue_cents' | 'spend_cents') => arr.reduce((s, r) => s + r[key], 0);

  const mrrCents      = sum(last30, 'revenue_cents');
  const prevMrrCents   = sum(prev30, 'revenue_cents');
  const totalSpendCents = sum(last30, 'spend_cents');
  const mrrGrowthPct  = prevMrrCents > 0 ? Math.round(((mrrCents - prevMrrCents) / prevMrrCents) * 10000) / 100 : null;
  const blendedRoas   = totalSpendCents > 0 ? Math.round((mrrCents / totalSpendCents) * 100) / 100 : null;

  return {
    has_data:          true,
    series,
    mrr_cents:         mrrCents,
    prev_mrr_cents:    prevMrrCents,
    mrr_growth_pct:    mrrGrowthPct,
    total_spend_cents: totalSpendCents,
    blended_roas:      blendedRoas,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'mrr-tracker', [
    { max: 5,  window: 60   },
    { max: 30, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'get_report');

  try {
    switch (action) {
      case 'sync':
        return okResponse(await handleSync(userId), origin);
      case 'get_report':
        return okResponse(await handleGetReport(userId), origin);
      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    console.error('mrr-tracker error:', err);
    return errResponse(err instanceof Error ? err.message : 'MRR tracker error', 500, origin);
  }
});
