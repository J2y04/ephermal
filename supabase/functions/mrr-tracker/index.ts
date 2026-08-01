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
import { requirePlan } from '../_shared/plan.ts';
import { computeCatalogMargin } from '../_shared/margin.ts';

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
async function fetchShopifyDaily(userId: string): Promise<{ revenue: DailyMap; orders: DailyMap; connected: boolean; error: string | null }> {
  const revenue: DailyMap = new Map();
  const orders: DailyMap = new Map();

  const { data: creds } = await supabase
    .from('user_integrations')
    .select('shopify_token, shopify_shop')
    .eq('user_id', userId)
    .maybeSingle();
  const token = creds?.shopify_token as string | undefined;
  const shop  = creds?.shopify_shop as string | undefined;
  // Not connected is the expected, error-free state for a user who hasn't linked Shopify yet.
  if (!token || !shop) return { revenue, orders, connected: false, error: null };

  const createdMin = `${isoDaysAgo(SYNC_DAYS)}T00:00:00Z`;
  let pageInfo: string | null = null;
  let hasMore = true;
  let error: string | null = null;

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
    if (!res.ok) {
      // A connected store genuinely has zero orders sometimes (brand-new store — Ephermal's
      // exact target user). Only flag as an error when the request itself failed, so the
      // dashboard can tell "no sales yet" apart from "token expired, reconnect".
      error = res.status === 401 || res.status === 403
        ? 'Shopify token expired or revoked — reconnect in Settings'
        : `Shopify API error (${res.status})`;
      break;
    }

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

  return { revenue, orders, connected: true, error };
}

// ── Meta: daily spend ─────────────────────────────────────────────────────────
async function fetchMetaDaily(userId: string): Promise<{ spend: DailyMap; conversions: DailyMap; connected: boolean; error: string | null }> {
  const spend: DailyMap = new Map();
  const conversions: DailyMap = new Map();
  const { data: creds } = await supabase
    .from('user_integrations')
    .select('meta_token, meta_account')
    .eq('user_id', userId)
    .maybeSingle();
  const token     = creds?.meta_token as string | undefined;
  const accountId = creds?.meta_account as string | undefined;
  if (!token || !accountId) return { spend, conversions, connected: false, error: null };

  let error: string | null = null;
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
    // A connected ad account can genuinely have $0 spend (no active campaigns yet) — only
    // flag an error when the Insights call itself failed, so the dashboard can distinguish
    // "no spend yet" from "Meta token expired, reconnect".
    error = 'Meta connection error — token may have expired, reconnect in Settings';
  }
  return { spend, conversions, connected: true, error };
}

// ── Google Ads: daily spend ───────────────────────────────────────────────────
async function fetchGoogleDaily(userId: string): Promise<{ spend: DailyMap; conversions: DailyMap; connected: boolean; error: string | null }> {
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
  // Not connected is the expected, error-free state for a user who hasn't linked Google Ads yet.
  if (!refreshToken || !customerId) return { spend, conversions, connected: false, error: null };
  if (!devToken) {
    console.error('mrr-tracker: GOOGLE_ADS_DEVELOPER_TOKEN not configured');
    return { spend, conversions, connected: true, error: 'Google Ads sync temporarily unavailable' };
  }

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
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      // Distinguish a revoked/expired refresh token (real error the merchant must act on)
      // from a genuinely $0-spend account — previously both silently returned empty maps,
      // so the dashboard showed "$0 spend" for a merchant whose connection was actually broken.
      const revoked = tokenData.error === 'invalid_grant';
      return {
        spend, conversions, connected: true,
        error: revoked
          ? 'Google Ads connection expired — reconnect in Settings'
          : 'Google Ads token refresh failed — reconnect in Settings',
      };
    }

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
    if (!res.ok) {
      return {
        spend, conversions, connected: true,
        error: res.status === 401 || res.status === 403
          ? 'Google Ads access denied — reconnect in Settings'
          : `Google Ads API error (${res.status})`,
      };
    }
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
    return { spend, conversions, connected: true, error: 'Google Ads sync failed — try again later' };
  }
  return { spend, conversions, connected: true, error: null };
}

async function handleSync(userId: string): Promise<Record<string, unknown>> {
  const [shopify, meta, google] = await Promise.all([
    fetchShopifyDaily(userId),
    fetchMetaDaily(userId),
    fetchGoogleDaily(userId),
  ]);
  const { revenue, orders } = shopify;

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
    synced_days:       rows.length,
    // Connectivity now reflects whether credentials exist, not whether any data came back —
    // a brand-new store or a campaign with zero spend is a connected account with real zeros,
    // not a disconnected one. See shopify/meta/google_error for actual sync failures.
    shopify_connected: shopify.connected,
    meta_connected:    meta.connected,
    google_connected:  google.connected,
    shopify_error:     shopify.error,
    meta_error:        meta.error,
    google_error:      google.error,
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

  // Catalog-level margin (same source Profit Tracker uses) - there's no per-order/per-SKU
  // revenue breakdown anywhere in the schema, so margin here is a blended estimate:
  // revenue × catalog-average-margin%, not true per-order accounting. Always label it
  // "Estimated" wherever it's shown.
  const { data: products } = await supabase
    .from('shopify_products')
    .select('price_cents, cogs_cents')
    .eq('user_id', userId);
  const { avgMarginPercent, productsWithCogs, totalProducts } = computeCatalogMargin(products ?? []);

  const snapshots = rows ?? [];
  if (snapshots.length === 0) {
    return {
      has_data: false, series: [], mrr_cents: 0, prev_mrr_cents: 0, mrr_growth_pct: null,
      total_spend_cents: 0, blended_roas: null, margin_pct: avgMarginPercent, margin_cents: null,
      products_with_cogs: productsWithCogs, total_products: totalProducts,
    };
  }

  const series = snapshots.map(r => {
    const spend = (r.meta_spend_cents ?? 0) + (r.google_spend_cents ?? 0);
    const revenueCents = r.shopify_revenue_cents ?? 0;
    return {
      date:           r.snapshot_date,
      revenue_cents:  revenueCents,
      spend_cents:    spend,
      orders:         r.shopify_orders_count ?? 0,
      conversions:    r.conversions ?? 0,
      roas:           spend > 0 ? Math.round((revenueCents / spend) * 100) / 100 : null,
      margin_cents:   avgMarginPercent !== null ? Math.round(revenueCents * avgMarginPercent / 100) : null,
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
  const marginCents   = avgMarginPercent !== null ? Math.round(mrrCents * avgMarginPercent / 100) : null;

  return {
    has_data:          true,
    series,
    mrr_cents:         mrrCents,
    prev_mrr_cents:    prevMrrCents,
    mrr_growth_pct:    mrrGrowthPct,
    total_spend_cents: totalSpendCents,
    blended_roas:      blendedRoas,
    margin_pct:         avgMarginPercent,
    margin_cents:       marginCents,
    products_with_cogs: productsWithCogs,
    total_products:     totalProducts,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const gate = await requirePlan(userId, 'growth', origin, 'the MRR tracker');
  if (gate) return gate;

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
    return errResponse('MRR tracker error', 500, origin);
  }
});
