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
  if (!res.ok || 'error' in (data as object)) {
    const msg = (data as MetaError).error?.message ?? `Meta API error ${res.status}`;
    throw new Error(msg);
  }
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
  if (!res.ok || 'error' in (data as object)) {
    const msg = (data as MetaError).error?.message ?? `Meta API error ${res.status}`;
    throw new Error(msg);
  }
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
  if (!res.ok || 'error' in (data as object)) {
    const msg = (data as MetaError).error?.message ?? `Meta API error ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ── Insight field sets ──────────────────────────────────────────────────────

export const CAMPAIGN_INSIGHT_FIELDS =
  'spend,impressions,clicks,actions,action_values,ctr,frequency,reach,roas';

export const CAMPAIGN_FIELDS =
  'id,name,status,objective,daily_budget,budget_remaining,created_time,updated_time';

export const CREATIVE_FIELDS =
  'id,name,title,body,image_url,thumbnail_url,video_id,object_type,status,created_time';

export const AUDIENCE_FIELDS =
  'id,name,subtype,approximate_count,delivery_status,created_time,description';

/** Parse ROAS from actions/action_values arrays returned by Meta insights */
export function parseROAS(
  actions: { action_type: string; value: string }[] = [],
  actionValues: { action_type: string; value: string }[] = [],
  spend: string = '0',
): number {
  const purchaseValue = actionValues
    .filter(a => a.action_type === 'offsite_conversion.fb_pixel_purchase')
    .reduce((sum, a) => sum + parseFloat(a.value || '0'), 0);
  const spendNum = parseFloat(spend || '0');
  return spendNum > 0 ? Math.round((purchaseValue / spendNum) * 100) / 100 : 0;
}

/** Parse conversion count from actions array */
export function parseConversions(
  actions: { action_type: string; value: string }[] = [],
): number {
  return actions
    .filter(a => a.action_type === 'offsite_conversion.fb_pixel_purchase')
    .reduce((sum, a) => sum + parseInt(a.value || '0', 10), 0);
}
