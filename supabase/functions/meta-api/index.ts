/**
 * Ephermal — Meta API Edge Function
 *
 * Replaces all n8n Meta Ads workflows. Handles:
 *   GET  /meta-api?action=overview      Dashboard KPIs
 *   GET  /meta-api?action=campaigns     Campaign list with insights
 *   GET  /meta-api?action=creatives     Creative list
 *   GET  /meta-api?action=audiences     Custom audience list
 *   GET  /meta-api?action=pixel         Pixel status
 *   GET  /meta-api?action=analytics     Analytics breakdown
 *   POST /meta-api  { action: 'create_campaign', ... }
 *   POST /meta-api  { action: 'update_campaign', ... }
 *   POST /meta-api  { action: 'pause' | 'enable', campaign_id }
 *   POST /meta-api  { action: 'scale_budget', campaign_id, multiplier }
 *   POST /meta-api  { action: 'bulk_action', campaign_ids, action }
 *   POST /meta-api  { action: 'create_audience', ... }
 *   POST /meta-api  { action: 'create_lookalike', ... }
 *   POST /meta-api  { action: 'approve_creative' | 'reject_creative', id }
 *
 * Required env vars:
 *   SUPABASE_URL              auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY auto-injected
 *   APP_URL                   https://ephermal.app
 *
 * The Meta access token is always loaded from user_integrations (scoped to userId).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';
import {
  metaGet, metaPost, metaDelete,
  CAMPAIGN_FIELDS, CAMPAIGN_INSIGHT_FIELDS,
  CREATIVE_FIELDS, AUDIENCE_FIELDS,
  parseROAS, parseConversions,
} from '../_shared/meta.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ── Helpers ─────────────────────────────────────────────────────────────────

function dateRange(days = 30): { since: string; until: string } {
  const until = new Date();
  const since = new Date(Date.now() - days * 86400000);
  return {
    since: since.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  };
}

/** Resolve Meta token + account — always loaded from DB, scoped to authenticated userId */
async function resolveCredentials(
  userId: string,
): Promise<{ token: string; accountId: string } | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('meta_token, meta_account')
    .eq('user_id', userId)
    .single();

  if (!data?.meta_token || !data?.meta_account) return null;
  return { token: data.meta_token, accountId: data.meta_account };
}

// ── READ handlers ────────────────────────────────────────────────────────────

async function getOverview(accountId: string, token: string, userId: string) {
  const { since, until } = dateRange(30);

  const [campaignRes, pixelRes] = await Promise.allSettled([
    metaGet<{ data: Record<string, unknown>[] }>(
      `/${accountId}/campaigns`,
      {
        fields: `${CAMPAIGN_FIELDS},insights.date_preset(last_30d){${CAMPAIGN_INSIGHT_FIELDS}}`,
        limit: '100',
      },
      token,
    ),
    metaGet<{ data: Record<string, unknown>[] }>(
      `/${accountId}/adspixels`,
      { fields: 'id,name,last_fired_time,code' },
      token,
    ),
  ]);

  const campaigns = campaignRes.status === 'fulfilled'
    ? campaignRes.value.data ?? []
    : [];

  let totalSpend = 0, totalImpressions = 0, totalClicks = 0,
      totalConversions = 0, roasSum = 0, roasCount = 0;

  for (const c of campaigns) {
    const ins = (c.insights as { data: Record<string, unknown>[] } | undefined)?.data?.[0] ?? {};
    const spend       = parseFloat(ins.spend as string ?? '0');
    const impressions = parseInt(ins.impressions as string ?? '0', 10);
    const clicks      = parseInt(ins.clicks as string ?? '0', 10);
    const conversions = parseConversions(ins.actions as { action_type: string; value: string }[]);
    const roas        = parseROAS(
      ins.actions as { action_type: string; value: string }[],
      ins.action_values as { action_type: string; value: string }[],
      ins.spend as string,
    );

    totalSpend       += spend;
    totalImpressions += impressions;
    totalClicks      += clicks;
    totalConversions += conversions;
    if (roas > 0) { roasSum += roas; roasCount++; }
  }

  // Count creatives from DB
  const { count: creativesCount } = await supabase
    .from('creatives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const pixel = pixelRes.status === 'fulfilled'
    ? pixelRes.value.data?.[0] ?? null
    : null;

  return {
    total_spend:       Math.round(totalSpend * 100) / 100,
    total_impressions: totalImpressions,
    total_clicks:      totalClicks,
    total_conversions: totalConversions,
    roas:              roasCount > 0 ? Math.round((roasSum / roasCount) * 100) / 100 : 0,
    total_creatives:   creativesCount ?? 0,
    pixel_active:      !!pixel?.id,
    pixel_id:          pixel?.id ?? null,
    pixel_last_fired:  pixel?.last_fired_time ?? null,
    campaign_count:    campaigns.length,
    period_days:       30,
  };
}

async function getCampaigns(accountId: string, token: string, userId: string) {
  const { data: cached, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Always refresh from Meta and upsert
  let metaCampaigns: Record<string, unknown>[] = [];
  try {
    const res = await metaGet<{ data: Record<string, unknown>[] }>(
      `/${accountId}/campaigns`,
      {
        fields: `${CAMPAIGN_FIELDS},insights.date_preset(last_30d){${CAMPAIGN_INSIGHT_FIELDS}}`,
        limit: '100',
      },
      token,
    );
    metaCampaigns = res.data ?? [];
  } catch (e) {
    // Return cached data if Meta call fails
    return cached ?? [];
  }

  const rows = metaCampaigns.map(c => {
    const ins = (c.insights as { data: Record<string, unknown>[] } | undefined)?.data?.[0] ?? {};
    const spend       = parseFloat(ins.spend as string ?? '0');
    const impressions = parseInt(ins.impressions as string ?? '0', 10);
    const clicks      = parseInt(ins.clicks as string ?? '0', 10);
    const ctr         = parseFloat(ins.ctr as string ?? '0');
    const conversions = parseConversions(ins.actions as { action_type: string; value: string }[]);
    const roas        = parseROAS(
      ins.actions as { action_type: string; value: string }[],
      ins.action_values as { action_type: string; value: string }[],
      ins.spend as string,
    );
    const status = String(c.status ?? 'UNKNOWN').toLowerCase()
      .replace('active', 'live').replace('paused', 'paused')
      .replace('archived', 'draft').replace('deleted', 'draft');

    return {
      id:           String(c.id),
      user_id:      userId,
      account_id:   accountId,
      name:         String(c.name ?? ''),
      status,
      platform:     'meta',
      objective:    String(c.objective ?? ''),
      daily_budget: parseInt(String(c.daily_budget ?? '0'), 10),
      total_spend:  spend,
      roas,
      ctr,
      impressions,
      clicks,
      conversions,
      meta_data:    c,
      synced_at:    new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    await supabase.from('campaigns').upsert(rows, { onConflict: 'id,user_id' });
  }

  return rows;
}

async function getCreatives(accountId: string, token: string, userId: string, status?: string) {
  // Read from DB (source of truth for status/approval state)
  let query = supabase
    .from('creatives')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data: dbCreatives } = await query;

  // Also sync from Meta if no status filter (full refresh)
  if (!status) {
    try {
      const res = await metaGet<{ data: Record<string, unknown>[] }>(
        `/${accountId}/adcreatives`,
        { fields: CREATIVE_FIELDS, limit: '50' },
        token,
      );
      const rows = (res.data ?? []).map(c => ({
        id:            String(c.id),
        user_id:       userId,
        account_id:    accountId,
        headline:      String(c.title || c.name || ''),
        body:          String(c.body ?? ''),
        type:          c.video_id ? 'video' : 'image',
        status:        'approved', // already live on Meta
        thumbnail_url: String(c.thumbnail_url || c.image_url || ''),
        meta_data:     c,
      }));
      if (rows.length > 0) {
        await supabase.from('creatives').upsert(rows, { onConflict: 'id,user_id', ignoreDuplicates: true });
      }
    } catch { /* non-fatal */ }
  }

  return dbCreatives ?? [];
}

async function getAudiences(accountId: string, token: string, userId: string) {
  let metaAudiences: Record<string, unknown>[] = [];
  try {
    const res = await metaGet<{ data: Record<string, unknown>[] }>(
      `/${accountId}/customaudiences`,
      { fields: AUDIENCE_FIELDS, limit: '50' },
      token,
    );
    metaAudiences = res.data ?? [];
  } catch { /* return DB cache */ }

  if (metaAudiences.length > 0) {
    const rows = metaAudiences.map(a => ({
      id:                 String(a.id),
      user_id:            userId,
      account_id:         accountId,
      name:               String(a.name ?? ''),
      type:               'CUSTOM',
      subtype:            String(a.subtype ?? ''),
      approximate_count:  parseInt(String(a.approximate_count ?? '0'), 10),
      delivery_status:    String((a.delivery_status as { code: number })?.code ?? ''),
      meta_data:          a,
      synced_at:          new Date().toISOString(),
    }));
    await supabase.from('audiences').upsert(rows, { onConflict: 'id,user_id' });
    return rows;
  }

  const { data } = await supabase
    .from('audiences')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

async function getPixel(accountId: string, token: string) {
  const res = await metaGet<{ data: Record<string, unknown>[] }>(
    `/${accountId}/adspixels`,
    { fields: 'id,name,last_fired_time,code,owner_ad_account' },
    token,
  );
  const pixel = res.data?.[0] ?? null;
  return {
    active:        !!pixel?.id,
    id:            pixel?.id ?? null,
    name:          pixel?.name ?? null,
    last_fired:    pixel?.last_fired_time ?? null,
    code:          pixel?.code ?? null,
  };
}

// ── WRITE handlers ───────────────────────────────────────────────────────────

async function createCampaign(
  accountId: string, token: string, userId: string,
  body: Record<string, unknown>,
) {
  const { name, objective = 'OUTCOME_TRAFFIC', daily_budget, countries = ['US'] } = body;
  if (!name) throw new Error('name is required');
  const budget = parseInt(String(daily_budget ?? '5000'), 10); // cents

  // 1. Create campaign
  const camp = await metaPost<{ id: string }>(`/${accountId}/campaigns`, {
    name,
    objective,
    status: 'PAUSED',
    special_ad_categories: [],
  }, token);

  // 2. Create ad set
  const adSet = await metaPost<{ id: string }>(`/${accountId}/adsets`, {
    name: `${name} - Ad Set`,
    campaign_id: camp.id,
    daily_budget: budget,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'REACH',
    targeting: { geo_locations: { countries } },
    status: 'PAUSED',
  }, token);

  // 3. Persist to DB
  await supabase.from('campaigns').upsert({
    id:           camp.id,
    user_id:      userId,
    account_id:   accountId,
    name:         String(name),
    status:       'draft',
    platform:     'meta',
    objective:    String(objective),
    daily_budget: budget,
    meta_data:    { campaign_id: camp.id, adset_id: adSet.id },
    synced_at:    new Date().toISOString(),
  }, { onConflict: 'id,user_id' });

  return { success: true, campaign_id: camp.id, adset_id: adSet.id };
}

async function setCampaignStatus(
  token: string, campaignId: string, status: 'ACTIVE' | 'PAUSED',
) {
  await metaPost(`/${campaignId}`, { status }, token);
  return { success: true, campaign_id: campaignId, status };
}

async function scaleBudget(
  token: string, userId: string,
  campaignId: string, multiplier: number,
) {
  if (multiplier < 0.1 || multiplier > 10) throw new Error('multiplier must be 0.1–10');

  // Get current budget from Meta
  const camp = await metaGet<{ daily_budget: string }>(
    `/${campaignId}`,
    { fields: 'daily_budget' },
    token,
  );
  const current = parseInt(camp.daily_budget || '0', 10);
  const newBudget = Math.round(current * multiplier);

  await metaPost(`/${campaignId}`, { daily_budget: String(newBudget) }, token);

  // Update DB
  await supabase.from('campaigns')
    .update({ daily_budget: newBudget, synced_at: new Date().toISOString() })
    .eq('id', campaignId).eq('user_id', userId);

  return { success: true, old_budget: current, new_budget: newBudget };
}

async function bulkAction(
  token: string, userId: string,
  campaignIds: string[], action: string, budgetMultiplier?: number,
) {
  const results = await Promise.allSettled(
    campaignIds.map(id => {
      if (action === 'pause')  return setCampaignStatus(token, id, 'PAUSED');
      if (action === 'enable') return setCampaignStatus(token, id, 'ACTIVE');
      if (action === 'scale_budget') return scaleBudget(token, userId, id, budgetMultiplier ?? 1.15);
      return Promise.reject(new Error(`Unknown action: ${action}`));
    }),
  );
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed    = results.filter(r => r.status === 'rejected').length;
  return { success: true, summary: { succeeded, failed } };
}

async function createAudience(
  accountId: string, token: string, userId: string,
  body: Record<string, unknown>,
) {
  const { name, type = 'CUSTOMER_FILE', description } = body;
  if (!name) throw new Error('name is required');

  const res = await metaPost<{ id: string }>(`/${accountId}/customaudiences`, {
    name,
    subtype: String(type),
    description: description ?? '',
    customer_file_source: 'USER_PROVIDED_ONLY',
  }, token);

  await supabase.from('audiences').upsert({
    id:         res.id,
    user_id:    userId,
    account_id: accountId,
    name:       String(name),
    type:       'CUSTOM',
    subtype:    String(type),
    synced_at:  new Date().toISOString(),
  }, { onConflict: 'id,user_id' });

  return { success: true, audience_id: res.id };
}

async function createLookalike(
  accountId: string, token: string, userId: string,
  body: Record<string, unknown>,
) {
  const { source_audience_id, country = 'US', ratio = 0.02 } = body;
  if (!source_audience_id) throw new Error('source_audience_id is required');

  const res = await metaPost<{ id: string }>(`/${accountId}/customaudiences`, {
    name:                   `Lookalike (${country}, ${Math.round(parseFloat(String(ratio)) * 100)}%)`,
    subtype:                'LOOKALIKE',
    origin_audience_id:     String(source_audience_id),
    lookalike_spec: {
      ratio:     parseFloat(String(ratio)),
      country:   String(country).toUpperCase().slice(0, 2),
      type:      'similarity',
    },
  }, token);

  await supabase.from('audiences').upsert({
    id:         res.id,
    user_id:    userId,
    account_id: accountId,
    name:       `Lookalike (${country}, ${Math.round(parseFloat(String(ratio)) * 100)}%)`,
    type:       'CUSTOM',
    subtype:    'LOOKALIKE',
    synced_at:  new Date().toISOString(),
  }, { onConflict: 'id,user_id' });

  return { success: true, audience_id: res.id, note: 'Lookalike may take up to 2 hours to populate' };
}

async function updateCreativeStatus(
  userId: string, creativeId: string, status: 'approved' | 'rejected',
) {
  const { error } = await supabase
    .from('creatives')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', creativeId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return { success: true, id: creativeId, status };
}

// ── Router ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'meta', [
    { max: 30,  window: 60   },
    { max: 300, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  const creds = await resolveCredentials(userId);
  const { token, accountId } = creds ?? { token: '', accountId: '' };

  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';

  // Allow status-filtered creatives reads without Meta credentials (DB-only path)
  const isDbOnlyRead = req.method === 'GET' && action === 'creatives' && url.searchParams.has('status');
  if (!creds && !isDbOnlyRead) {
    return errResponse('Meta account not connected — add your token in Settings', 400, origin);
  }

  try {
    // ── GET requests ────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      switch (action) {
        case 'overview':
          return okResponse(await getOverview(accountId, token, userId), origin);

        case 'campaigns':
          return okResponse(await getCampaigns(accountId, token, userId), origin);

        case 'creatives': {
          const status = url.searchParams.get('status') ?? undefined;
          return okResponse(await getCreatives(accountId, token, userId, status), origin);
        }

        case 'audiences':
          return okResponse(await getAudiences(accountId, token, userId), origin);

        case 'pixel':
          return okResponse(await getPixel(accountId, token), origin);

        case 'analytics': {
          // Re-use campaigns data enriched with insights
          const campaigns = await getCampaigns(accountId, token, userId);
          const totals = campaigns.reduce(
            (acc, c) => ({
              spend:       acc.spend + (c.total_spend || 0),
              impressions: acc.impressions + (c.impressions || 0),
              clicks:      acc.clicks + (c.clicks || 0),
              conversions: acc.conversions + (c.conversions || 0),
            }),
            { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
          );
          const roasArr = campaigns.filter(c => c.roas > 0).map(c => c.roas);
          const avgRoas = roasArr.length
            ? roasArr.reduce((a: number, b: number) => a + b, 0) / roasArr.length
            : 0;
          return okResponse({ ...totals, roas: Math.round(avgRoas * 100) / 100, campaigns }, origin);
        }

        default:
          return errResponse(`Unknown action: ${action}`, 400, origin);
      }
    }

    // ── POST requests ────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      let body: Record<string, unknown> = {};
      try { body = await req.json(); } catch { /* empty body ok */ }

      const postAction = String(body.action ?? action);

      switch (postAction) {
        case 'create_campaign':
          return okResponse(await createCampaign(accountId, token, userId, body), origin);

        case 'pause':
        case 'enable': {
          const id = String(body.campaign_id ?? body.id ?? '');
          if (!id) return errResponse('campaign_id required', 400, origin);
          // BOLA guard: verify campaign belongs to this user before touching Meta API
          const { data: owned } = await supabase.from('campaigns')
            .select('id').eq('id', id).eq('user_id', userId).single();
          if (!owned) return errResponse('Campaign not found', 403, origin);
          return okResponse(
            await setCampaignStatus(token, id, postAction === 'enable' ? 'ACTIVE' : 'PAUSED'),
            origin,
          );
        }

        case 'scale_budget': {
          const id  = String(body.campaign_id ?? body.id ?? '');
          const mul = parseFloat(String(body.multiplier ?? body.budget_multiplier ?? '1.15'));
          if (!id) return errResponse('campaign_id required', 400, origin);
          // BOLA guard
          const { data: owned } = await supabase.from('campaigns')
            .select('id').eq('id', id).eq('user_id', userId).single();
          if (!owned) return errResponse('Campaign not found', 403, origin);
          return okResponse(await scaleBudget(token, userId, id, mul), origin);
        }

        case 'bulk_action':
        case 'bulk-action': {
          const ids = Array.isArray(body.campaign_ids) ? body.campaign_ids.map(String) : [];
          if (!ids.length) return errResponse('campaign_ids required', 400, origin);
          // BOLA guard: verify ALL campaign IDs belong to this user
          const { data: owned } = await supabase.from('campaigns')
            .select('id').in('id', ids).eq('user_id', userId);
          const ownedIds = new Set((owned ?? []).map((r: { id: string }) => r.id));
          const unauthorized = ids.find(id => !ownedIds.has(id));
          if (unauthorized) return errResponse('Campaign not found', 403, origin);
          return okResponse(
            await bulkAction(token, userId, ids, String(body.action_type ?? body.action ?? 'pause'), parseFloat(String(body.budget_multiplier ?? '1.15'))),
            origin,
          );
        }

        case 'create_audience':
          return okResponse(await createAudience(accountId, token, userId, body), origin);

        case 'create_lookalike':
          return okResponse(await createLookalike(accountId, token, userId, body), origin);

        case 'approve_creative':
        case 'approve':
          return okResponse(await updateCreativeStatus(userId, String(body.id), 'approved'), origin);

        case 'reject_creative':
        case 'reject':
          return okResponse(await updateCreativeStatus(userId, String(body.id), 'rejected'), origin);

        default:
          return errResponse(`Unknown action: ${postAction}`, 400, origin);
      }
    }

    return errResponse('Method not allowed', 405, origin);

  } catch (err) {
    console.error('meta-api error:', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    return errResponse(msg, 500, origin);
  }
});
