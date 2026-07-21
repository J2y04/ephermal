/**
 * Ephermal — Campaign Launcher (Supabase Edge Function)
 *
 * Launches ads to Meta and/or Google without the user touching ad managers.
 * Uses claude-haiku-4-5 to generate campaign copy + structure.
 *
 * POST { action: 'prepare',      product, audience, budget, objective?, tone? }
 * POST { action: 'save_draft',   name, objective, budget_daily, platform, copy }  — manual create, no AI
 * POST { action: 'update',       campaign_id, name?, objective?, budget_daily?, platform?, copy? }  — draft only
 * POST { action: 'delete',       campaign_id }  — draft only
 * POST { action: 'launch_meta',  campaign_id }
 * POST { action: 'launch_google', campaign_id }
 * POST { action: 'launch',       campaign_id, platforms? }
 * POST { action: 'list' }
 * POST { action: 'status',       campaign_id }
 *
 * Plan gating:
 *   starter → prepare + launch_meta (core value — Meta Ads is the default platform for small stores)
 *   growth  → + launch_google
 *   scale   → same launch permissions as growth; Scale is differentiated by bulk/multi-store
 *             tools elsewhere (bulk-manager, multi-store view), not by campaign-launch access
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { metaPost, metaGet } from '../_shared/meta.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAIN_MODEL    = 'claude-haiku-4-5-20251001';

const STYLE_GUARD = '\n\nWriting style: write like a real media buyer, not an AI. Never use em dashes (—) or arrow characters (→). Use periods, commas, or "and" to join clauses instead.';

async function callClaude(system: string, user: string, maxTokens = 1500): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MAIN_MODEL,
      max_tokens: maxTokens,
      system:     system + STYLE_GUARD,
      messages:   [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json() as { content: { type: string; text?: string }[] };
  return data.content?.find(c => c.type === 'text')?.text ?? '';
}

async function getUserPlan(userId: string): Promise<string> {
  const { data } = await supabase.from('user_plans').select('plan').eq('user_id', userId).single();
  return data?.plan ?? 'starter';
}

async function getIntegrations(userId: string) {
  const { data } = await supabase
    .from('user_integrations')
    .select('meta_token, meta_account, meta_page_id, meta_page_token, shopify_shop, google_refresh_token, google_ads_customer_id')
    .eq('user_id', userId)
    .single();
  return data;
}

/** AI generates complete campaign copy + structure */
async function prepareCampaign(
  userId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const product   = body.product as Record<string, unknown> ?? {};
  const audience  = body.audience as Record<string, unknown> ?? {};
  const budget    = Number(body.budget ?? 20);
  const objective = String(body.objective ?? 'OUTCOME_SALES');
  const tone      = String(body.tone ?? 'authentic and conversational');

  const system = `You are an elite performance marketing specialist writing ad campaigns.
Generate complete, launch-ready campaign structures for Meta Ads and Google Ads.
Return ONLY valid JSON. No markdown fences, no explanation.
JSON schema:
{
  "campaign_name": string,
  "objective": string,
  "meta": {
    "campaign_name": string,
    "adset_name": string,
    "targeting": {
      "geo_locations": { "countries": string[] },
      "age_min": number,
      "age_max": number
    },
    "ads": [ { "headline": string, "primary_text": string, "description": string, "cta": string } ]
  },
  "google": {
    "campaign_name": string,
    "ad_group_name": string,
    "headlines": string[],
    "descriptions": string[],
    "keywords": string[],
    "bid_strategy": string
  },
  "ugc_hook": string,
  "audience_summary": string
}`;

  const userMsg = `Generate a complete ad campaign:
Product: ${JSON.stringify(product)}
Target audience: ${JSON.stringify(audience)}
Daily budget: $${budget}
Objective: ${objective}
Tone: ${tone}
Generate 3 distinct ad variations in meta.ads (different hooks/angles) so the campaign has real creative variety.
Make headlines benefit-focused and scroll-stopping. Keep Meta primary text under 125 chars. Google headlines under 30 chars each.`;

  const raw = await callClaude(system, userMsg, 1800);
  let copy: Record<string, unknown>;
  try {
    copy = JSON.parse(raw);
  } catch {
    throw new Error('AI returned invalid campaign structure');
  }

  // Save to launched_campaigns as draft
  const name = String(copy.campaign_name ?? `Campaign ${new Date().toLocaleDateString()}`);
  const { data: saved, error } = await supabase
    .from('launched_campaigns')
    .insert({
      user_id:     userId,
      platform:    'both',
      name,
      status:      'draft',
      objective,
      budget_daily: budget,
      audience:    audience,
      copy,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to save campaign: ${error.message}`);

  return { campaign_id: saved?.id, copy, status: 'draft' };
}

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v24';

async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }).toString(),
  });
  const data = await res.json() as { error?: string; error_description?: string; access_token?: string };
  if (data.error || !data.access_token) throw new Error(`Google token refresh failed: ${data.error_description ?? data.error ?? 'unknown'}`);
  return data.access_token;
}

async function gAdsPost(customerId: string, accessToken: string, devToken: string, endpoint: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${GOOGLE_ADS_API}/customers/${customerId}/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'developer-token': devToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(JSON.stringify(err.error ?? err));
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function launchToGoogle(userId: string, campaignId: string, autoEnable = false): Promise<Record<string, unknown>> {
  const { data: row } = await supabase.from('launched_campaigns').select('*').eq('id', campaignId).eq('user_id', userId).single();
  if (!row) throw new Error('Campaign not found');

  const integrations = await getIntegrations(userId);
  const refreshToken = integrations?.google_refresh_token;
  const rawCid       = String(integrations?.google_ads_customer_id ?? '').replace(/-/g, '');
  if (!refreshToken || !rawCid) throw new Error('Google Ads not connected. Connect in Settings');

  const devToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!devToken) throw new Error('Google Ads developer token not configured');

  const accessToken = await getGoogleAccessToken(refreshToken);
  const copy        = row.copy as Record<string, unknown>;
  const gCopy       = copy?.google as Record<string, unknown> ?? {};
  const budget      = Number(row.budget_daily ?? 20);
  const name        = String(gCopy.campaign_name ?? row.name);
  const keywords    = (gCopy.keywords     as string[] | undefined) ?? [];
  const headlines   = (gCopy.headlines    as string[] | undefined) ?? [];
  const descriptions= (gCopy.descriptions as string[] | undefined) ?? [];

  // 1. Budget
  const budgetRes  = await gAdsPost(rawCid, accessToken, devToken, 'campaignBudgets:mutate', {
    operations: [{ create: { name: `${name} Budget`, amountMicros: String(Math.round(budget * 1_000_000)), deliveryMethod: 'STANDARD' } }],
  }) as { results: { resourceName: string }[] };
  const budgetRn   = (budgetRes as unknown as { results: { resourceName: string }[] }).results?.[0]?.resourceName;
  if (!budgetRn) throw new Error('Failed to create Google Ads budget');

  // 2. Campaign
  const campRes    = await gAdsPost(rawCid, accessToken, devToken, 'campaigns:mutate', {
    operations: [{ create: { name, advertisingChannelType: 'SEARCH', status: autoEnable ? 'ENABLED' : 'PAUSED', campaignBudget: budgetRn, biddingStrategyType: 'MAXIMIZE_CONVERSIONS', networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false } } }],
  }) as { results: { resourceName: string }[] };
  const campaignRn = (campRes as unknown as { results: { resourceName: string }[] }).results?.[0]?.resourceName;
  if (!campaignRn) throw new Error('Failed to create Google Ads campaign');
  const googleCampaignId = campaignRn.split('/').pop()!;

  // 3. Ad group
  const agRes      = await gAdsPost(rawCid, accessToken, devToken, 'adGroups:mutate', {
    operations: [{ create: { name: String(gCopy.ad_group_name ?? `${name} Ad Group`), campaign: campaignRn, status: 'ENABLED', type: 'SEARCH_STANDARD', cpcBidMicros: '1000000' } }],
  }) as { results: { resourceName: string }[] };
  const adGroupRn  = (agRes as unknown as { results: { resourceName: string }[] }).results?.[0]?.resourceName;

  // 4. Keywords
  if (adGroupRn && keywords.length > 0) {
    await gAdsPost(rawCid, accessToken, devToken, 'adGroupCriteria:mutate', {
      operations: keywords.slice(0, 20).map(kw => ({ create: { adGroup: adGroupRn, keyword: { text: kw.slice(0, 80), matchType: 'BROAD' }, status: 'ENABLED' } })),
    });
  }

  // 5. Responsive Search Ad
  if (adGroupRn && headlines.length >= 3 && descriptions.length >= 2) {
    await gAdsPost(rawCid, accessToken, devToken, 'adGroupAds:mutate', {
      operations: [{ create: { adGroup: adGroupRn, status: autoEnable ? 'ENABLED' : 'PAUSED', ad: { responsiveSearchAd: { headlines: headlines.slice(0,15).map(h => ({ text: h.slice(0,30) })), descriptions: descriptions.slice(0,4).map(d => ({ text: d.slice(0,90) })) } } } }],
    });
  }

  const { error: updateErr } = await supabase.from('launched_campaigns').update({ google_campaign_id: googleCampaignId, status: 'active', launched_at: new Date().toISOString() }).eq('id', campaignId).eq('user_id', userId);

  if (updateErr) {
    console.error(`CRITICAL: campaign ${campaignId} launched live on Google but DB update failed:`, updateErr);
  }

  const baseNote = autoEnable ? 'Google Search campaign is LIVE.' : 'Google Search campaign created as PAUSED. Enable in Google Ads Manager.';
  const dbWarning = updateErr
    ? ' WARNING: launch succeeded but we could not update your dashboard. Refresh and check Google Ads Manager directly before relaunching.'
    : '';

  return { campaign_id: campaignId, google_campaign_id: googleCampaignId, status: 'active', enabled: autoEnable, note: `${baseNote}${dbWarning}` };
}

const META_CTA_MAP: Record<string, string> = {
  'shop now':    'SHOP_NOW',
  'learn more':  'LEARN_MORE',
  'sign up':     'SIGN_UP',
  'sign up now': 'SIGN_UP',
  'get offer':   'GET_OFFER',
  'subscribe':   'SUBSCRIBE',
  'contact us':  'CONTACT_US',
  'download':    'DOWNLOAD',
  'book now':    'BOOK_TRAVEL',
};

function metaCtaType(cta: string): string {
  return META_CTA_MAP[cta.trim().toLowerCase()] ?? 'SHOP_NOW';
}

/** Launch prepared campaign to Meta — creates the campaign, ad set, and a real ad per variation. */
async function launchToMeta(userId: string, campaignId: string, autoEnable = false): Promise<Record<string, unknown>> {
  const { data: row } = await supabase
    .from('launched_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .single();

  if (!row) throw new Error('Campaign not found');

  const integrations = await getIntegrations(userId);
  const token      = integrations?.meta_token;
  const accountId  = integrations?.meta_account;
  if (!token || !accountId) throw new Error('Meta Ads not connected. Connect in Settings');

  const pageId    = integrations?.meta_page_id;
  const pageToken = integrations?.meta_page_token;
  const shop      = integrations?.shopify_shop;
  const linkUrl   = shop ? `https://${shop}` : (Deno.env.get('APP_URL') ?? 'https://ephermal.app');

  const copy      = row.copy as Record<string, unknown>;
  const metaCopy  = copy?.meta as Record<string, unknown> ?? {};
  // Whitelist-sanitize targeting: only pass through safe fields. Meta interest/behavior
  // targeting requires real Meta-assigned numeric IDs that an LLM cannot know and may
  // fabricate; never forward AI-generated interests/behaviors to the live Ads API.
  const rawTargeting = metaCopy?.targeting as Record<string, unknown> ?? {};
  const targeting = {
    geo_locations: rawTargeting.geo_locations ?? { countries: ['US'] },
    age_min: typeof rawTargeting.age_min === 'number' ? rawTargeting.age_min : 18,
    age_max: typeof rawTargeting.age_max === 'number' ? rawTargeting.age_max : 65,
  };
  const budget    = Math.round((row.budget_daily ?? 20) * 100); // Meta uses cents
  const ads       = (metaCopy?.ads as { headline?: string; primary_text?: string; description?: string; cta?: string }[] | undefined) ?? [];

  const adStatus = autoEnable ? 'ACTIVE' : 'PAUSED';

  // 1. Create campaign
  const campaign = await metaPost<{ id: string }>(`/${accountId}/campaigns`, {
    name:                   String(metaCopy.campaign_name ?? row.name),
    objective:              String(row.objective ?? 'OUTCOME_TRAFFIC'),
    status:                 adStatus,
    special_ad_categories: [],
    // Required by Graph API v25+ whenever the campaign has no campaign-level budget
    // (we set daily_budget on the ad set below instead) — omitting it is a hard 400.
    is_adset_budget_sharing_enabled: false,
  }, token);

  // Conversion-optimized ad sets (OFFSITE_CONVERSIONS) require a promoted_object pointing
  // at a real Meta Pixel — check whether one exists before choosing the optimization goal,
  // otherwise Meta hard-rejects the ad set with "Select a promoted object for your ad set."
  let pixelId: string | null = null;
  if (row.objective === 'OUTCOME_SALES') {
    try {
      const pixels = await metaGet<{ data: { id: string }[] }>(`/${accountId}/adspixels`, { fields: 'id' }, token);
      pixelId = pixels.data?.[0]?.id ?? null;
    } catch {
      // Pixel lookup failing shouldn't block the launch — just fall back to REACH below.
    }
  }
  const useConversions = row.objective === 'OUTCOME_SALES' && !!pixelId;

  // 2. Create ad set
  const adSet = await metaPost<{ id: string }>(`/${accountId}/adsets`, {
    name:              String(metaCopy.adset_name ?? `${row.name} Ad Set`),
    campaign_id:       campaign.id,
    daily_budget:      budget,
    billing_event:     'IMPRESSIONS',
    optimization_goal: useConversions ? 'OFFSITE_CONVERSIONS' : 'REACH',
    // Required whenever bidding isn't a manual bid cap — omitting it is a hard 400 on
    // Graph API v25+.
    bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
    ...(useConversions ? { promoted_object: { pixel_id: pixelId, custom_event_type: 'PURCHASE' } } : {}),
    targeting,
    status:            adStatus,
  }, token);

  // 3. Create a real ad creative + ad per variation — requires a connected Facebook Page.
  // Without a page, the campaign/ad set above still exist but carry no ads; finish them
  // manually in Meta Ads Manager (same as before pages were wired up).
  const adIds: string[] = [];
  let adCreationError: string | null = null;
  if (pageId && pageToken && ads.length > 0) {
    for (const ad of ads.slice(0, 5)) {
      try {
        const creative = await metaPost<{ id: string }>(`/${accountId}/adcreatives`, {
          name: `${row.name}: ${String(ad.headline ?? 'Ad').slice(0, 40)}`,
          object_story_spec: {
            page_id: pageId,
            link_data: {
              link:        linkUrl,
              message:     String(ad.primary_text ?? ''),
              name:        String(ad.headline ?? row.name),
              description: String(ad.description ?? ''),
              call_to_action: { type: metaCtaType(String(ad.cta ?? 'Shop Now')), value: { link: linkUrl } },
            },
          },
        }, pageToken);

        const adObj = await metaPost<{ id: string }>(`/${accountId}/ads`, {
          name:      String(ad.headline ?? `${row.name} Ad`),
          adset_id:  adSet.id,
          creative:  { creative_id: creative.id },
          status:    adStatus,
        }, token);
        adIds.push(adObj.id);
      } catch (e) {
        adCreationError = e instanceof Error ? e.message : 'Ad creation failed';
        console.error('launchToMeta ad creation error:', adCreationError);
      }
    }
  }

  // 4. Update DB with Meta IDs
  const { error: updateErr } = await supabase
    .from('launched_campaigns')
    .update({
      platform_campaign_id: campaign.id,
      meta_adset_id:        adSet.id,
      status:               'active',
      launched_at:          new Date().toISOString(),
    })
    .eq('id', campaignId)
    .eq('user_id', userId);

  if (updateErr) {
    console.error(`CRITICAL: campaign ${campaignId} launched live on Meta but DB update failed:`, updateErr);
  }

  const notePrefix = autoEnable ? 'Campaign is LIVE on Meta.' : 'Campaign created as PAUSED.';
  const pixelNote = row.objective === 'OUTCOME_SALES' && !useConversions
    ? ' No Meta Pixel found on this ad account, so the ad set was optimized for reach instead of purchases — install a Pixel for conversion-optimized delivery.'
    : '';
  const adsNote = !pageId
    ? ' Connect a Facebook Page in Settings to auto-create the ad(s) next time. For now, add the ad manually in Meta Ads Manager.'
    : adIds.length > 0
      ? ` ${adIds.length} ad(s) created automatically.`
      : adCreationError
        ? ` Ad creation failed (${adCreationError}). Add the ad manually in Meta Ads Manager.`
        : '';
  const dbWarning = updateErr
    ? ' WARNING: launch succeeded but we could not update your dashboard. Refresh and check Meta Ads Manager directly before relaunching.'
    : '';

  return {
    campaign_id:      campaignId,
    meta_campaign_id: campaign.id,
    meta_adset_id:    adSet.id,
    meta_ad_ids:      adIds,
    status:           'active',
    enabled:          autoEnable,
    note:             `${notePrefix}${pixelNote}${adsNote}${dbWarning}`,
  };
}

/** Manually create a draft campaign — no AI call. Frontend supplies the full copy structure. */
async function saveDraft(userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const name        = String(body.name ?? '').trim();
  const platform     = String(body.platform ?? 'meta');
  if (!name) throw new Error('Campaign name is required');
  if (!['meta', 'google', 'both'].includes(platform)) throw new Error('platform must be meta, google, or both');

  const { data: saved, error } = await supabase
    .from('launched_campaigns')
    .insert({
      user_id:      userId,
      platform,
      name,
      status:       'draft',
      objective:    String(body.objective ?? 'OUTCOME_SALES'),
      budget_daily: Number(body.budget_daily ?? 20),
      audience:     body.audience ?? {},
      copy:         body.copy ?? {},
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save campaign: ${error.message}`);
  return saved as Record<string, unknown>;
}

/** Update a draft campaign's fields. Only allowed while status='draft' — never mutates a launched campaign. */
async function updateDraft(userId: string, campaignId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: existing } = await supabase
    .from('launched_campaigns')
    .select('status')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!existing) throw new Error('Campaign not found');
  if (existing.status !== 'draft') throw new Error('Only draft campaigns can be edited. This campaign has already been launched');

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined)         updates.name = String(body.name).trim();
  if (body.objective !== undefined)    updates.objective = String(body.objective);
  if (body.budget_daily !== undefined) updates.budget_daily = Number(body.budget_daily);
  if (body.platform !== undefined)     updates.platform = String(body.platform);
  if (body.copy !== undefined)         updates.copy = body.copy;
  if (body.audience !== undefined)     updates.audience = body.audience;

  const { data: saved, error } = await supabase
    .from('launched_campaigns')
    .update(updates)
    .eq('id', campaignId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update campaign: ${error.message}`);
  return saved as Record<string, unknown>;
}

/** Delete a draft campaign. Refuses to delete anything already launched — pause it in the ad platform instead. */
async function deleteDraft(userId: string, campaignId: string): Promise<Record<string, unknown>> {
  const { data: existing } = await supabase
    .from('launched_campaigns')
    .select('status')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!existing) throw new Error('Campaign not found');
  if (existing.status !== 'draft') throw new Error('Only draft campaigns can be deleted. Pause or remove launched campaigns from the ad platform directly');

  const { error } = await supabase
    .from('launched_campaigns')
    .delete()
    .eq('id', campaignId)
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to delete campaign: ${error.message}`);
  return { deleted: true, campaign_id: campaignId };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'prepare');

  // Rate limit tier depends on action cost — cheap DB reads (list/status) must not
  // share a budget with the AI generation call or a real Meta/Google Ads API launch,
  // otherwise just opening the campaign review before launching burns the launch quota.
  const READ_ACTIONS  = new Set(['list', 'status']);
  const LAUNCH_ACTIONS = new Set(['launch_meta', 'launch_google', 'launch']);
  const rateTier = READ_ACTIONS.has(action)
    ? { key: 'launcher-read',  tiers: [{ max: 30, window: 60 }, { max: 300, window: 3600 }] }
    : action === 'prepare'
      ? { key: 'launcher-prepare', tiers: [{ max: 6, window: 60 }, { max: 40, window: 3600 }] }
      : LAUNCH_ACTIONS.has(action)
        ? { key: 'launcher-launch', tiers: [{ max: 8, window: 60 }, { max: 40, window: 3600 }] }
        : { key: 'launcher-write', tiers: [{ max: 15, window: 60 }, { max: 100, window: 3600 }] };
  const rl = await rateLimitTiered(userId, rateTier.key, rateTier.tiers);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  const plan   = await getUserPlan(userId);

  try {
    switch (action) {
      case 'prepare': {
        if (!ANTHROPIC_KEY) return errResponse('AI not configured. Set ANTHROPIC_API_KEY', 503, origin);
        return okResponse(await prepareCampaign(userId, body), origin);
      }

      case 'save_draft':
        return okResponse(await saveDraft(userId, body), origin);

      case 'update': {
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        return okResponse(await updateDraft(userId, campaignId, body), origin);
      }

      case 'delete': {
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        return okResponse(await deleteDraft(userId, campaignId), origin);
      }

      case 'launch_meta': {
        // Launching to Meta is a core, Starter-tier action — small Shopify stores need this
        // to work on day one, not after upgrading.
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        // Launches are always created PAUSED — approval to go live happens outside this
        // API. Never trust a client-supplied auto_enable flag here.
        return okResponse(await launchToMeta(userId, campaignId, false), origin);
      }

      case 'launch_google': {
        if (plan === 'starter') {
          return errResponse('Upgrade to Growth to launch Google campaigns directly from Ephermal', 403, origin);
        }
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        // Launches are always created PAUSED — approval to go live happens outside this
        // API. Never trust a client-supplied auto_enable flag here.
        return okResponse(await launchToGoogle(userId, campaignId, false), origin);
      }

      case 'launch': {
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        const platforms  = (body.platforms as string[] | undefined) ?? ['meta'];

        // Launches are always created PAUSED — approval to go live happens outside this
        // API. Never trust a client-supplied auto_enable flag here.
        const results: Record<string, unknown> = {};
        if (platforms.includes('meta')) {
          results.meta = await launchToMeta(userId, campaignId, false);
        }
        if (platforms.includes('google') && plan !== 'starter') {
          results.google = await launchToGoogle(userId, campaignId, false);
        }
        return okResponse(results, origin);
      }

      case 'list': {
        const { data } = await supabase
          .from('launched_campaigns')
          .select('id,name,platform,status,objective,budget_daily,copy,launched_at,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        return okResponse({ campaigns: data ?? [] }, origin);
      }

      case 'status': {
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        const { data } = await supabase
          .from('launched_campaigns')
          .select('*')
          .eq('id', campaignId)
          .eq('user_id', userId)
          .single();
        if (!data) return errResponse('Campaign not found', 404, origin);
        return okResponse(data, origin);
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    console.error('campaign-launcher error:', err);
    return errResponse('Campaign operation failed', 500, origin);
  }
});
