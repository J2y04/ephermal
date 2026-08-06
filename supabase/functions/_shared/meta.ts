/**
 * Ephermal — Meta Graph API client (shared)
 *
 * Thin wrapper around the Meta Graph API v19.0.
 * All calls require a user-level or system-user access token.
 */

const GRAPH_VERSION = 'v25.0';
const GRAPH_BASE    = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface MetaError {
  error: { message: string; type: string; code: number; fbtrace_id: string };
}

// Meta error codes that specifically mean "this token/permission is dead", not "something else
// went wrong" — 190=expired/invalid access token, 102/463/467=session invalidated, 200=missing
// permission. Distinguishing these lets callers tell "reconnect your account" apart from a
// generic API hiccup, instead of both looking like an empty/zeroed account (the exact bug class
// already found and fixed once in mrr-tracker this session).
const AUTH_ERROR_CODES = new Set([190, 102, 200, 463, 467]);

export class MetaApiError extends Error {
  isAuthError: boolean;
  constructor(message: string, opts: { type?: string; code?: number } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.isAuthError = opts.type === 'OAuthException' || AUTH_ERROR_CODES.has(opts.code ?? -1);
  }
}

function throwMetaError(data: unknown, status: number): never {
  const err = (data as MetaError)?.error;
  throw new MetaApiError(err?.message ?? `Meta API error ${status}`, { type: err?.type, code: err?.code });
}

/** GET from Meta Graph API */
export async function metaGet<T = unknown>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json() as T | MetaError;
  if (!res.ok || 'error' in (data as object)) throwMetaError(data, res.status);
  return data as T;
}

/** POST to Meta Graph API (JSON body) */
export async function metaPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  token: string,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T | MetaError;
  if (!res.ok || 'error' in (data as object)) throwMetaError(data, res.status);
  return data as T;
}

/** DELETE from Meta Graph API */
export async function metaDelete<T = unknown>(
  path: string,
  token: string,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);

  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json() as T | MetaError;
  if (!res.ok || 'error' in (data as object)) throwMetaError(data, res.status);
  return data as T;
}

// ── Insight field sets ──────────────────────────────────────────────────────

// 'roas' is NOT a valid Meta Ads Insights field — confirmed against Meta's official AdsInsights
// field schema, there is no scalar "roas"; ROAS only exists as list<AdsActionStats> fields like
// purchase_roas/website_purchase_roas. Requesting an unknown field fails the ENTIRE Graph API
// call (not just that field), so every campaigns/overview/analytics fetch that used this
// constant has been 400ing. ROAS is (correctly) computed ourselves from actions/action_values
// via parseROAS() below, which is why the raw field was never actually read anywhere.
export const CAMPAIGN_INSIGHT_FIELDS =
  'spend,impressions,clicks,actions,action_values,ctr,frequency,reach';

export const CAMPAIGN_FIELDS =
  'id,name,status,objective,daily_budget,budget_remaining,created_time,updated_time';

export const CREATIVE_FIELDS =
  'id,name,title,body,image_url,thumbnail_url,video_id,object_type,status,created_time';

export const AUDIENCE_FIELDS =
  'id,name,subtype,approximate_count,delivery_status,created_time,description';

// 'offsite_conversion.fb_pixel_purchase' is Meta's legacy pixel-only purchase action type.
// 'omni_purchase' is Meta's modern, deduplicated omnichannel purchase rollup (pixel + Conversions
// API + onsite Shop + app combined) — the default for Shopify's native Meta Facebook & Instagram
// channel, which pairs pixel with CAPI. Pixel and CAPI events for the same purchase are
// deduplicated by Meta via a shared event_id, so omni_purchase and the legacy pixel-only type
// must never both be summed (that would double-count the same purchase) — prefer omni_purchase
// when present, and only fall back to the legacy type for older/non-CAPI setups that don't
// report it at all.
const PURCHASE_ACTION_TYPES = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase'];

function pickPurchaseActionType<T extends { action_type: string }>(items: T[]): string | null {
  for (const type of PURCHASE_ACTION_TYPES) {
    if (items.some(a => a.action_type === type)) return type;
  }
  return null;
}

/** Parse ROAS from actions/action_values arrays returned by Meta insights */
export function parseROAS(
  actions: { action_type: string; value: string }[] = [],
  actionValues: { action_type: string; value: string }[] = [],
  spend: string = '0',
): number {
  const purchaseType = pickPurchaseActionType(actionValues);
  const purchaseValue = purchaseType
    ? actionValues.filter(a => a.action_type === purchaseType).reduce((sum, a) => sum + parseFloat(a.value || '0'), 0)
    : 0;
  const spendNum = parseFloat(spend || '0');
  return spendNum > 0 ? Math.round((purchaseValue / spendNum) * 100) / 100 : 0;
}

/** Parse conversion count from actions array */
export function parseConversions(
  actions: { action_type: string; value: string }[] = [],
): number {
  const purchaseType = pickPurchaseActionType(actions);
  if (!purchaseType) return 0;
  return actions
    .filter(a => a.action_type === purchaseType)
    .reduce((sum, a) => sum + parseInt(a.value || '0', 10), 0);
}
