/**
 * Ephermal — Budget AI (Supabase Edge Function)
 *
 * AI-powered budget calculation using claude-haiku-4-5.
 *
 * POST { action: 'calculate',  revenue_goal, days?, aov?, current_roas?, platforms? }
 * POST { action: 'allocate',   total_budget, meta_roas?, google_roas? }
 * POST { action: 'forecast',   daily_budget, current_roas?, days? }
 * POST { action: 'apply',      recommendation_id }   — Scale plan only
 * POST { action: 'history' }
 *
 * Plan gating:
 *   starter → calculate only
 *   growth  → calculate + allocate + forecast + history
 *   scale   → all + apply (auto-execute budget changes)
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';
import { metaPost } from '../_shared/meta.ts';
import { checkAIBudget, recordAIUsage } from '../_shared/ai-usage.ts';
import { parseClaudeJson } from '../_shared/ai-json.ts';
import { captureError } from '../_shared/sentry.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const BUDGET_MODEL  = 'claude-haiku-4-5-20251001';

// Same absolute daily-budget ceiling roas-optimizer clamps scaled budgets to
// (DEFAULT_RULES.max_daily_budget, hard-capped at 10000) — this endpoint had no equivalent
// ceiling anywhere: not on the AI's calculate-time output, and not on the apply-time value
// pushed live to Meta/Google (only a $1 floor).
const MAX_DAILY_BUDGET_USD = 10000;

/** Clamp any AI-returned daily-budget field into a sane range before persisting/returning it. */
function clampBudgetFields(result: Record<string, unknown>): Record<string, unknown> {
  const clamped = { ...result };
  for (const key of ['daily_budget_total', 'daily_budget_meta', 'daily_budget_google']) {
    const val = Number(clamped[key]);
    if (Number.isFinite(val)) clamped[key] = Math.max(0, Math.min(val, MAX_DAILY_BUDGET_USD));
  }
  return clamped;
}

const STYLE_GUARD = '\n\nWriting style: write like a real CFO, not an AI. Never use em dashes (—) or arrow characters (→). Use periods, commas, or "and" to join clauses instead.';

async function callClaude(userId: string, system: string, user: string): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      BUDGET_MODEL,
      max_tokens: 2048,
      system:     system + STYLE_GUARD,
      messages:   [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json() as { content: { type: string; text?: string }[]; usage?: { input_tokens: number; output_tokens: number } };
  if (data.usage) await recordAIUsage(userId, BUDGET_MODEL, data.usage.input_tokens, data.usage.output_tokens);
  return data.content?.find(c => c.type === 'text')?.text ?? '';
}

async function getUserPlan(userId: string): Promise<string> {
  const { data } = await supabase.from('user_plans').select('plan').eq('user_id', userId).single();
  return data?.plan ?? 'starter';
}

async function handleCalculate(userId: string, body: Record<string, unknown>) {
  const revenueGoal  = Number(body.revenue_goal ?? 0);
  const days         = Number(body.days ?? 30);
  const aov          = Number(body.aov ?? 50);
  const currentRoas  = Number(body.current_roas ?? 2.5);
  const platforms    = (body.platforms as string[] | undefined) ?? ['meta'];

  if (revenueGoal < 1) throw new Error('revenue_goal must be greater than 0');

  const system = `You are an expert performance marketing CFO. Calculate optimal ad budgets.
Return ONLY valid JSON. No markdown, no explanation outside the JSON.
JSON schema:
{
  "daily_budget_total": number,
  "daily_budget_meta": number,
  "daily_budget_google": number,
  "expected_roas": number,
  "expected_revenue": number,
  "expected_conversions": number,
  "meta_allocation_pct": number,
  "google_allocation_pct": number,
  "reasoning": string,
  "scaling_trigger": { "scale_up_at_roas": number, "scale_down_at_roas": number, "scale_pct": number },
  "warnings": string[]
}`;

  const userMsg = `Calculate optimal ad budget allocation:
- Revenue goal: $${revenueGoal} over ${days} days
- Average order value: $${aov}
- Current/target ROAS: ${currentRoas}x
- Active platforms: ${platforms.join(', ')}
Use industry benchmarks. Account for learning phase (first 7 days). Include Meta vs Google split reasoning.`;

  const raw  = await callClaude(userId, system, userMsg);
  let result: Record<string, unknown>;
  try {
    result = parseClaudeJson(raw);
  } catch {
    throw new Error('Failed to parse budget calculation from AI');
  }
  result = clampBudgetFields(result);

  // Persist recommendation
  const { data: saved } = await supabase
    .from('budget_recommendations')
    .insert({ user_id: userId, recommendation: { ...result, revenue_goal: revenueGoal, days, aov, platforms } })
    .select('id')
    .single();

  return { ...result, recommendation_id: saved?.id ?? null };
}

async function handleAllocate(body: Record<string, unknown>) {
  const totalBudget  = Number(body.total_budget ?? 0);
  const metaRoas     = Number(body.meta_roas ?? 0);
  const googleRoas   = Number(body.google_roas ?? 0);

  if (totalBudget < 1) throw new Error('total_budget must be greater than 0');

  // Simple allocation logic: weight by ROAS if both available, else 65/35 default
  let metaPct: number, googlePct: number;
  if (metaRoas > 0 && googleRoas > 0) {
    const total = metaRoas + googleRoas;
    metaPct    = Math.round((metaRoas / total) * 100);
    googlePct  = 100 - metaPct;
  } else {
    metaPct    = 65;
    googlePct  = 35;
  }

  const metaBudget   = Math.round((totalBudget * metaPct / 100) * 100) / 100;
  const googleBudget = Math.round((totalBudget * googlePct / 100) * 100) / 100;

  // Campaign-level breakdown: 60% prospecting, 30% retargeting, 10% brand
  return {
    total_budget:        totalBudget,
    meta_daily:          metaBudget,
    google_daily:        googleBudget,
    meta_pct:            metaPct,
    google_pct:          googlePct,
    meta_breakdown: {
      prospecting:  Math.round(metaBudget * 0.60 * 100) / 100,
      retargeting:  Math.round(metaBudget * 0.30 * 100) / 100,
      brand:        Math.round(metaBudget * 0.10 * 100) / 100,
    },
    google_breakdown: {
      search:       Math.round(googleBudget * 0.55 * 100) / 100,
      performance_max: Math.round(googleBudget * 0.30 * 100) / 100,
      display:      Math.round(googleBudget * 0.15 * 100) / 100,
    },
    basis: metaRoas > 0 && googleRoas > 0 ? 'roas_weighted' : 'industry_benchmark',
  };
}

async function handleForecast(body: Record<string, unknown>) {
  const dailyBudget  = Number(body.daily_budget ?? 0);
  const currentRoas  = Number(body.current_roas ?? 2.5);
  const days         = Number(body.days ?? 30);

  if (dailyBudget < 1) throw new Error('daily_budget must be greater than 0');

  const projections = [];
  let cumulativeSpend = 0, cumulativeRevenue = 0;

  for (let d = 1; d <= days; d++) {
    // ROAS ramp: learning phase reduces effective ROAS for first 7 days
    const roasMultiplier = d <= 7 ? (0.7 + (d / 7) * 0.3) : 1.0;
    const effectiveRoas  = currentRoas * roasMultiplier;
    const dayRevenue     = dailyBudget * effectiveRoas;
    cumulativeSpend      += dailyBudget;
    cumulativeRevenue    += dayRevenue;

    if (d % 7 === 0 || d === days) {
      projections.push({
        day:                d,
        cumulative_spend:   Math.round(cumulativeSpend * 100) / 100,
        cumulative_revenue: Math.round(cumulativeRevenue * 100) / 100,
        period_roas:        Math.round(effectiveRoas * 100) / 100,
      });
    }
  }

  return {
    daily_budget:       dailyBudget,
    total_spend:        Math.round(dailyBudget * days * 100) / 100,
    projected_revenue:  Math.round(cumulativeRevenue * 100) / 100,
    projected_roas:     Math.round((cumulativeRevenue / (dailyBudget * days)) * 100) / 100,
    break_even_day:     Math.ceil(7 / currentRoas),
    projections,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'budget', [
    { max: 10, window: 60   },
    { max: 60, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'calculate');
  const plan   = await getUserPlan(userId);

  try {
    switch (action) {
      case 'calculate': {
        // Budget AI is gated to Growth+ client-side (dashboard.html GATED.budget = 'growth'),
        // but this action — the default when no `action` is sent — had no server-side check,
        // unlike allocate/forecast/apply below. A Starter user could call it directly and run
        // a real Anthropic call for free; checkAIBudget only caps weekly spend, it doesn't
        // enforce plan tier.
        if (plan === 'starter') return errResponse('Upgrade to Growth to access Budget AI', 403, origin);
        if (!ANTHROPIC_KEY) return errResponse('AI not configured. Set ANTHROPIC_API_KEY', 503, origin);
        const budgetCheck = await checkAIBudget(userId);
        if (!budgetCheck.ok) return errResponse(budgetCheck.message, 429, origin, { usage: budgetCheck.status });
        const result = await handleCalculate(userId, body);
        return okResponse(result, origin);
      }

      case 'allocate': {
        if (plan === 'starter') return errResponse('Upgrade to Growth to access budget allocation', 403, origin);
        return okResponse(await handleAllocate(body), origin);
      }

      case 'forecast': {
        if (plan === 'starter') return errResponse('Upgrade to Growth to access forecasting', 403, origin);
        return okResponse(await handleForecast(body), origin);
      }

      case 'apply': {
        if (plan !== 'scale') return errResponse('Upgrade to Scale to apply budgets', 403, origin);
        const recId     = String(body.recommendation_id ?? '');
        const campaignId = String(body.campaign_id ?? '');
        const platform  = String(body.platform ?? 'meta'); // 'meta'|'google'|'both'
        const budgetUsd = Number(body.budget_usd ?? 0);

        if (!recId)      return errResponse('recommendation_id required', 400, origin);
        if (!campaignId) return errResponse('campaign_id required', 400, origin);
        // Both Meta and Google campaign IDs are always numeric strings — this also closes off
        // campaignId being spliced unvalidated into the raw GAQL query below (google-api.ts's
        // 'budget' action already guards the identical query shape the same way).
        if (!/^\d+$/.test(campaignId)) return errResponse('campaign_id must be numeric', 400, origin);
        if (budgetUsd < 1) return errResponse('budget_usd must be at least 1', 400, origin);
        if (budgetUsd > MAX_DAILY_BUDGET_USD) return errResponse(`budget_usd must be at most $${MAX_DAILY_BUDGET_USD}/day`, 400, origin);

        // Load recommendation (ownership check)
        const { data: rec, error: recErr } = await supabase
          .from('budget_recommendations')
          .select('recommendation')
          .eq('id', recId)
          .eq('user_id', userId)
          .single();
        if (recErr || !rec) return errResponse('Recommendation not found', 404, origin);

        // BOLA guard: verify campaign belongs to this user before touching Meta/Google API —
        // same pattern meta-api.ts already established for its own mutation endpoints. Without
        // this, a client-supplied campaign_id was pushed straight to the live ad account with
        // only the caller's own valid token as the (unintended) authorization boundary.
        const { data: ownedCampaign } = await supabase
          .from('campaigns')
          .select('id')
          .eq('id', campaignId)
          .eq('user_id', userId)
          .single();
        if (!ownedCampaign) return errResponse('Campaign not found', 404, origin);

        const applied: { platform: string; success: boolean; error?: string }[] = [];

        // ── Apply to Meta ──────────────────────────────────────────────────────
        if (platform === 'meta' || platform === 'both') {
          const { data: creds } = await supabase
            .from('user_integrations')
            .select('meta_token')
            .eq('user_id', userId)
            .single();
          const metaToken = (creds?.meta_token as string) ?? '';
          if (!metaToken) {
            applied.push({ platform: 'meta', success: false, error: 'Meta not connected' });
          } else {
            try {
              // Meta daily_budget is in cents
              await metaPost(`/${campaignId}`, { daily_budget: String(Math.round(budgetUsd * 100)) }, metaToken);
              await supabase.from('campaigns')
                .update({ daily_budget: Math.round(budgetUsd * 100) })
                .eq('id', campaignId)
                .eq('user_id', userId);
              applied.push({ platform: 'meta', success: true });
            } catch (e) {
              applied.push({ platform: 'meta', success: false, error: e instanceof Error ? e.message : 'Meta API error' });
            }
          }
        }

        // ── Apply to Google ────────────────────────────────────────────────────
        if (platform === 'google' || platform === 'both') {
          const { data: gCreds } = await supabase
            .from('user_integrations')
            .select('google_refresh_token, google_ads_customer_id')
            .eq('user_id', userId)
            .single();

          const refreshToken = (gCreds?.google_refresh_token as string) ?? '';
          const customerId   = (gCreds?.google_ads_customer_id as string) ?? '';
          const devToken     = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '';

          if (!refreshToken || !customerId || !devToken) {
            applied.push({ platform: 'google', success: false, error: 'Google Ads not connected' });
          } else {
            try {
              // Exchange refresh token
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
              if (!tokenData.access_token) throw new Error(`Token refresh: ${tokenData.error}`);
              const accessToken = tokenData.access_token;

              const GADS = 'https://googleads.googleapis.com/v24';
              const headers = {
                'Authorization':   `Bearer ${accessToken}`,
                'developer-token': devToken,
                'Content-Type':    'application/json',
              };

              // Look up campaign budget resource name
              const searchRes = await fetch(`${GADS}/customers/${customerId}/googleAds:search`, {
                method: 'POST', headers,
                body: JSON.stringify({ query: `SELECT campaign_budget.resource_name FROM campaign WHERE campaign.id = ${campaignId} LIMIT 1` }),
              });
              // Google's REST search response serializes fields as lowerCamelCase, not the
              // snake_case used in the GAQL query text - reading campaign_budget/resource_name
              // here always read undefined, so this action always threw "Campaign not found"
              // even for a real, existing campaign. Same root cause already fixed tonight in
              // google-api's 'budget'/'campaigns'/'insights' actions.
              const searchData = await searchRes.json() as { results?: { campaignBudget?: { resourceName?: string } }[] };
              const budgetResource = searchData.results?.[0]?.campaignBudget?.resourceName;
              if (!budgetResource) throw new Error('Campaign not found in Google Ads');

              // Update budget
              const mutateRes = await fetch(`${GADS}/customers/${customerId}/campaignBudgets:mutate`, {
                method: 'POST', headers,
                body: JSON.stringify({
                  operations: [{ update: { resourceName: budgetResource, amountMicros: Math.round(budgetUsd * 1_000_000) }, updateMask: 'amountMicros' }],
                }),
              });
              if (!mutateRes.ok) {
                const err = await mutateRes.json().catch(() => ({})) as { error?: { message?: string } };
                throw new Error(err.error?.message ?? `Google API ${mutateRes.status}`);
              }
              // The Meta branch above keeps the local `campaigns` row in sync after a
              // successful mutate; this branch didn't, so the DB kept showing the stale budget
              // even though the real Google Ads mutate had genuinely succeeded - anything
              // reading budget from the DB instead of live data (e.g. roas-optimizer's
              // currentBudget = c.daily_budget) would act on the wrong number. Stored in cents
              // to match the unit convention the Meta branch and every DB reader already use.
              await supabase.from('campaigns')
                .update({ daily_budget: Math.round(budgetUsd * 100) })
                .eq('id', campaignId)
                .eq('user_id', userId);
              applied.push({ platform: 'google', success: true });
            } catch (e) {
              applied.push({ platform: 'google', success: false, error: e instanceof Error ? e.message : 'Google Ads error' });
            }
          }
        }

        // Only mark applied if at least one platform push actually succeeded — otherwise
        // Budget History shows a green "Applied" badge for a recommendation that never took effect.
        const anySuccess = applied.some(r => r.success);
        const { error: markErr } = await supabase.from('budget_recommendations')
          .update({ applied: anySuccess, auto_applied: false })
          .eq('id', recId)
          .eq('user_id', userId);
        if (markErr) captureError('budget-ai', 'budget-ai: failed to mark recommendation applied:', markErr.message);

        return okResponse({ applied, recommendation_id: recId, any_success: anySuccess }, origin);
      }

      case 'history': {
        if (plan === 'starter') return errResponse('Upgrade to Growth to view budget history', 403, origin);
        const { data } = await supabase
          .from('budget_recommendations')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        return okResponse({ recommendations: data ?? [] }, origin);
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    captureError('budget-ai', 'budget-ai error:', err);
    // Discarding the real error into a generic string made every failure (a bad Google Ads
    // response, an AI JSON-parse error, a Supabase error) look identical to the caller -
    // same fix already applied to google-api/campaign-launcher's equivalent catches.
    const msg = err instanceof Error ? err.message : 'Budget AI error';
    return errResponse(msg, 500, origin);
  }
});
