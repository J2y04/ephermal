/**
 * Ephermal — Campaign Launcher (Supabase Edge Function)
 *
 * Launches ads to Meta and/or Google without the user touching ad managers.
 * Uses llama-3.3-70b-versatile on Groq to generate campaign copy + structure.
 *
 * POST { action: 'prepare',      product, audience, budget, objective?, tone? }
 * POST { action: 'launch_meta',  campaign_id }
 * POST { action: 'launch_google', campaign_id }
 * POST { action: 'launch',       campaign_id, platforms? }
 * POST { action: 'list' }
 * POST { action: 'status',       campaign_id }
 *
 * Plan gating:
 *   starter → prepare only (generates copy, no launch)
 *   growth  → prepare + launch_meta
 *   scale   → prepare + launch_meta + launch_google + launch (both)
 *
 * Required env vars:
 *   GROQ_API_KEY
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

const GROQ_KEY  = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const MAIN_MODEL = 'llama-3.3-70b-versatile';

async function callGroq(system: string, user: string, maxTokens = 1500): Promise<string> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY not configured');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: MAIN_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Groq error ${res.status}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

async function getUserPlan(userId: string): Promise<string> {
  const { data } = await supabase.from('user_plans').select('plan').eq('user_id', userId).single();
  return data?.plan ?? 'starter';
}

async function getIntegrations(userId: string) {
  const { data } = await supabase
    .from('user_integrations')
    .select('meta_token, meta_account, google_refresh_token, google_ads_customer_id')
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
Return ONLY valid JSON — no markdown fences, no explanation.
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
      "age_max": number,
      "interests": { "id": string, "name": string }[],
      "behaviors": { "id": string, "name": string }[]
    },
    "headline": string,
    "primary_text": string,
    "description": string,
    "cta": string
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
Make headlines benefit-focused and scroll-stopping. Keep Meta primary text under 125 chars. Google headlines under 30 chars each.`;

  const raw = await callGroq(system, userMsg, 1800);
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

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v17';

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

async function launchToGoogle(userId: string, campaignId: string): Promise<Record<string, unknown>> {
  const { data: row } = await supabase.from('launched_campaigns').select('*').eq('id', campaignId).eq('user_id', userId).single();
  if (!row) throw new Error('Campaign not found');

  const integrations = await getIntegrations(userId);
  const refreshToken = integrations?.google_refresh_token;
  const rawCid       = String(integrations?.google_ads_customer_id ?? '').replace(/-/g, '');
  if (!refreshToken || !rawCid) throw new Error('Google Ads not connected — connect in Settings');

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
    operations: [{ create: { name, advertisingChannelType: 'SEARCH', status: 'PAUSED', campaignBudget: budgetRn, biddingStrategyType: 'MAXIMIZE_CONVERSIONS', networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false } } }],
  }) as { results: { resourceName: string }[] };
  const campaignRn = (campRes as unknown as { results: { resourceName: string }[] }).results?.[0]?.resourceName;
  if (!campaignRn) throw new Error('Failed to create Google Ads campaign');
  const googleCampaignId = campaignRn.split('/').pop()!;

  // 3. Ad group
  const agRes      = await gAdsPost(rawCid, accessToken, devToken, 'adGroups:mutate', {
    operations: [{ create: { name: String(gCopy.ad_group_name ?? `${name} — Ad Group`), campaign: campaignRn, status: 'ENABLED', type: 'SEARCH_STANDARD', cpcBidMicros: '1000000' } }],
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
      operations: [{ create: { adGroup: adGroupRn, status: 'PAUSED', ad: { responsiveSearchAd: { headlines: headlines.slice(0,15).map(h => ({ text: h.slice(0,30) })), descriptions: descriptions.slice(0,4).map(d => ({ text: d.slice(0,90) })) } } } }],
    });
  }

  await supabase.from('launched_campaigns').update({ google_campaign_id: googleCampaignId, status: 'active', launched_at: new Date().toISOString() }).eq('id', campaignId).eq('user_id', userId);

  return { campaign_id: campaignId, google_campaign_id: googleCampaignId, status: 'active', note: 'Google Search campaign created as PAUSED. Enable in Google Ads Manager.' };
}

/** Launch prepared campaign to Meta */
async function launchToMeta(userId: string, campaignId: string): Promise<Record<string, unknown>> {
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
  if (!token || !accountId) throw new Error('Meta Ads not connected — connect in Settings');

  const copy      = row.copy as Record<string, unknown>;
  const metaCopy  = copy?.meta as Record<string, unknown> ?? {};
  const targeting = metaCopy?.targeting as Record<string, unknown> ?? { geo_locations: { countries: ['US'] } };
  const budget    = Math.round((row.budget_daily ?? 20) * 100); // Meta uses cents

  // 1. Create campaign
  const campaign = await metaPost<{ id: string }>(`/${accountId}/campaigns`, {
    name:                   String(metaCopy.campaign_name ?? row.name),
    objective:              String(row.objective ?? 'OUTCOME_TRAFFIC'),
    status:                 'PAUSED',
    special_ad_categories: [],
  }, token);

  // 2. Create ad set
  const adSet = await metaPost<{ id: string }>(`/${accountId}/adsets`, {
    name:              String(metaCopy.adset_name ?? `${row.name} — Ad Set`),
    campaign_id:       campaign.id,
    daily_budget:      budget,
    billing_event:     'IMPRESSIONS',
    optimization_goal: row.objective === 'OUTCOME_SALES' ? 'OFFSITE_CONVERSIONS' : 'REACH',
    targeting,
    status:            'PAUSED',
  }, token);

  // 3. Update DB with Meta campaign ID
  await supabase
    .from('launched_campaigns')
    .update({
      platform_campaign_id: campaign.id,
      status:               'active',
      launched_at:          new Date().toISOString(),
    })
    .eq('id', campaignId)
    .eq('user_id', userId);

  return {
    campaign_id:    campaignId,
    meta_campaign_id: campaign.id,
    meta_adset_id:  adSet.id,
    status:         'active',
    note:           'Campaign created as PAUSED. Enable in Meta Ads Manager or via Campaigns tab.',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'launcher', [
    { max: 3,  window: 60   },
    { max: 20, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'prepare');
  const plan   = await getUserPlan(userId);

  try {
    switch (action) {
      case 'prepare': {
        if (!GROQ_KEY) return errResponse('AI not configured — set GROQ_API_KEY', 503, origin);
        return okResponse(await prepareCampaign(userId, body), origin);
      }

      case 'launch_meta': {
        if (plan === 'starter') {
          return errResponse('Upgrade to Growth to launch campaigns directly from Ephermal', 403, origin);
        }
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        return okResponse(await launchToMeta(userId, campaignId), origin);
      }

      case 'launch_google': {
        if (plan !== 'scale') {
          return errResponse('Upgrade to Scale to launch Google campaigns directly from Ephermal', 403, origin);
        }
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        return okResponse(await launchToGoogle(userId, campaignId), origin);
      }

      case 'launch': {
        if (plan === 'starter') {
          return errResponse('Upgrade to Growth to launch campaigns directly from Ephermal', 403, origin);
        }
        const campaignId = String(body.campaign_id ?? '');
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        const platforms = (body.platforms as string[] | undefined) ?? ['meta'];

        const results: Record<string, unknown> = {};
        if (platforms.includes('meta')) {
          results.meta = await launchToMeta(userId, campaignId);
        }
        if (platforms.includes('google') && plan === 'scale') {
          results.google = await launchToGoogle(userId, campaignId);
        }
        return okResponse(results, origin);
      }

      case 'list': {
        const { data } = await supabase
          .from('launched_campaigns')
          .select('id,name,platform,status,objective,budget_daily,launched_at,created_at')
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
    return errResponse(err instanceof Error ? err.message : 'Launch error', 500, origin);
  }
});
