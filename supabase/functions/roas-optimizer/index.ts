/**
 * Ephermal — ROAS Optimizer Edge Function
 *
 * Fetches campaign performance data and automatically applies
 * budget scaling or pausing rules based on configurable thresholds.
 *
 * POST /roas-optimizer  { action: 'analyze' }          — analyze all campaigns, return recommendations
 * POST /roas-optimizer  { action: 'apply' }            — analyze + apply actions (pause/scale)
 * POST /roas-optimizer  { action: 'rules', ...config } — update optimization rules for user
 *
 * Default rules (can be overridden per user in optimizer_rules table):
 *   pause_below_roas:   1.0    — pause if ROAS < 1.0 (losing money)
 *   scale_above_roas:   3.0    — increase budget if ROAS > 3.0
 *   scale_multiplier:   1.25   — increase budget by 25%
 *   max_daily_budget:   500    — never scale beyond $500/day
 *   min_spend:          20     — ignore campaigns with < $20 spend (no data)
 *   lookback_days:      7      — use last 7 days of data
 *
 * Required env vars:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { metaGet, metaPost, parseROAS } from '../_shared/meta.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';
import { requirePlan } from '../_shared/plan.ts';
import { checkAIBudget, recordAIUsage } from '../_shared/ai-usage.ts';
import { captureError } from '../_shared/sentry.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ANTHROPIC_KEY   = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

interface OptimizerRules {
  pause_below_roas:  number;
  scale_above_roas:  number;
  scale_multiplier:  number;
  max_daily_budget:  number;
  min_spend:         number;
  lookback_days:     number;
}

const DEFAULT_RULES: OptimizerRules = {
  pause_below_roas: 1.0,
  scale_above_roas: 3.0,
  scale_multiplier: 1.25,
  max_daily_budget: 500,
  min_spend:        20,
  lookback_days:    7,
};

interface CampaignAction {
  campaign_id:   string;
  campaign_name: string;
  current_roas:  number;
  current_spend: number;
  current_budget: number;
  action:        'pause' | 'scale' | 'hold';
  reason:        string;
  new_budget?:   number;
}

/** Load user's optimizer rules, falling back to defaults */
async function loadRules(userId: string): Promise<OptimizerRules> {
  const { data } = await supabase
    .from('optimizer_rules')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) return DEFAULT_RULES;
  return { ...DEFAULT_RULES, ...data } as OptimizerRules;
}

/**
 * Apply one-off threshold overrides from the request body on top of the saved rules —
 * without this, a "quick apply" call with custom thresholds silently falls back to
 * whatever's saved in optimizer_rules, ignoring what the caller actually asked for.
 * Same clamping as the `rules` action so an override can't push budgets out of bounds.
 */
function applyOverrides(rules: OptimizerRules, body: Record<string, unknown>): OptimizerRules {
  const overrides: Partial<OptimizerRules> = {};
  if (typeof body.pause_below_roas === 'number') overrides.pause_below_roas = body.pause_below_roas;
  if (typeof body.scale_above_roas === 'number') overrides.scale_above_roas = body.scale_above_roas;
  if (typeof body.min_spend === 'number')        overrides.min_spend = body.min_spend;
  if (typeof body.lookback_days === 'number')    overrides.lookback_days = body.lookback_days;
  if (typeof body.scale_multiplier === 'number') overrides.scale_multiplier = Math.min(Math.max(body.scale_multiplier, 1.0), 2.0);
  if (typeof body.max_daily_budget === 'number') overrides.max_daily_budget = Math.min(Math.max(body.max_daily_budget, 1), 10000);
  return { ...rules, ...overrides };
}

/** Load Meta access token for user — always from DB, never from request headers */
async function getMetaToken(userId: string): Promise<string> {
  const { data } = await supabase
    .from('user_integrations')
    .select('meta_token')
    .eq('user_id', userId)
    .single();
  return data?.meta_token ?? '';
}

/** Scaled daily budget for a campaign under the current rules, clamped to max_daily_budget. */
function computeScaledBudget(currentBudget: number, rules: OptimizerRules): number {
  return Math.min(
    Math.round(currentBudget * rules.scale_multiplier * 100) / 100,
    rules.max_daily_budget * 100, // Meta stores budgets in cents
  );
}

/** Analyze campaigns and compute recommended actions */
async function analyzeCampaigns(
  userId: string,
  token: string,
  rules: OptimizerRules,
): Promise<CampaignAction[]> {
  // Load active campaigns from DB
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'live');

  if (!campaigns?.length) return [];

  const actions: CampaignAction[] = [];
  const datePreset = `last_${rules.lookback_days}d`;

  await Promise.allSettled(
    campaigns.map(async (c) => {
      try {
        // Fetch fresh insights from Meta
        const insights = await metaGet<{
          data: {
            spend: string;
            impressions: string;
            actions?: { action_type: string; value: string }[];
            action_values?: { action_type: string; value: string }[];
          }[];
        }>(
          `/${c.id}/insights`,
          { fields: 'spend,impressions,actions,action_values', date_preset: datePreset },
          token,
        );

        const ins = insights.data?.[0];
        if (!ins) return;

        const spend = parseFloat(ins.spend ?? '0');
        const roas  = parseROAS(ins.actions ?? [], ins.action_values ?? [], ins.spend);

        // Ignore campaigns with insufficient spend
        if (spend < rules.min_spend) {
          actions.push({
            campaign_id:    c.id,
            campaign_name:  c.name,
            current_roas:   roas,
            current_spend:  spend,
            current_budget: c.daily_budget ?? 0,
            action:         'hold',
            reason:         `Insufficient data (spend $${spend.toFixed(2)} < $${rules.min_spend} threshold)`,
          });
          return;
        }

        const currentBudget = c.daily_budget ?? 0;

        if (roas < rules.pause_below_roas) {
          actions.push({
            campaign_id:    c.id,
            campaign_name:  c.name,
            current_roas:   roas,
            current_spend:  spend,
            current_budget: currentBudget,
            action:         'pause',
            reason:         `ROAS ${roas.toFixed(2)}× is below pause threshold (${rules.pause_below_roas}×)`,
          });
        } else if (roas >= rules.scale_above_roas) {
          const newBudget = computeScaledBudget(currentBudget, rules);
          actions.push({
            campaign_id:    c.id,
            campaign_name:  c.name,
            current_roas:   roas,
            current_spend:  spend,
            current_budget: currentBudget,
            action:         'scale',
            reason:         `ROAS ${roas.toFixed(2)}× exceeds scale threshold (${rules.scale_above_roas}×)`,
            new_budget:     newBudget,
          });
        } else {
          actions.push({
            campaign_id:    c.id,
            campaign_name:  c.name,
            current_roas:   roas,
            current_spend:  spend,
            current_budget: currentBudget,
            action:         'hold',
            reason:         `ROAS ${roas.toFixed(2)}× is within healthy range`,
          });
        }
      } catch (e) {
        console.warn(`Could not analyze campaign ${c.id}:`, e);
      }
    }),
  );

  return actions.sort((a, b) => {
    const order = { pause: 0, scale: 1, hold: 2 };
    return order[a.action] - order[b.action];
  });
}

// ── AI-grounded recommendations ──────────────────────────────────────────────
// The rule-based analyzeCampaigns() above still does the real data gathering
// (live ROAS/spend/budget per campaign from Meta). This layer packages that
// alongside real MRR/revenue context and, on Scale plan, audience intelligence,
// and asks Claude to reason about the whole account — not just per-campaign
// thresholds in isolation.

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
      model:      ANTHROPIC_MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json() as { content: { type: string; text?: string }[]; usage?: { input_tokens: number; output_tokens: number } };
  if (data.usage) await recordAIUsage(userId, ANTHROPIC_MODEL, data.usage.input_tokens, data.usage.output_tokens);
  return data.content?.find(c => c.type === 'text')?.text ?? '';
}

async function getUserPlan(userId: string): Promise<string> {
  const { data } = await supabase.from('user_plans').select('plan').eq('user_id', userId).single();
  return data?.plan ?? 'starter';
}

/** Real store revenue vs ad spend over the last 30 days, from the same table mrr-tracker fills. */
async function fetchMrrContext(userId: string): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('revenue_snapshots')
    .select('shopify_revenue_cents, meta_spend_cents, google_spend_cents')
    .eq('user_id', userId)
    .gte('snapshot_date', since);

  if (!data || data.length === 0) return { available: false };

  const revenueCents = data.reduce((s, r) => s + (r.shopify_revenue_cents ?? 0), 0);
  const spendCents   = data.reduce((s, r) => s + (r.meta_spend_cents ?? 0) + (r.google_spend_cents ?? 0), 0);

  return {
    available:                 true,
    last_30d_revenue_usd:      Math.round(revenueCents / 100),
    last_30d_ad_spend_usd:     Math.round(spendCents / 100),
    blended_roas:              spendCents > 0 ? Math.round((revenueCents / spendCents) * 100) / 100 : null,
    net_profit_estimate_usd:   Math.round((revenueCents - spendCents) / 100),
  };
}

/** Scale-plan only: real synced audience data (from the `audiences` table meta-api keeps in sync). */
async function fetchAudienceIntelligence(userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('audiences')
    .select('name, subtype, approximate_count, delivery_status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return { available: false };
  return { available: true, audiences: data };
}

interface AIRecommendation {
  campaigns: unknown[];
  account_summary: string;
  model_version: string;
  generated_at: string;
}

/**
 * Sends the rule-based signals + real MRR context + (Scale-plan) audience intel to
 * Claude and returns grounded, account-aware recommendations. The rule thresholds
 * are passed in as ONE signal, not the final answer — the model reasons about
 * overall account profitability, not just per-campaign ROAS.
 */
async function generateAIRecommendations(
  userId: string,
  ruleActions: CampaignAction[],
  rules: OptimizerRules,
): Promise<AIRecommendation> {
  const plan = await getUserPlan(userId);
  const [mrrContext, audienceIntel] = await Promise.all([
    fetchMrrContext(userId),
    plan === 'scale'
      ? fetchAudienceIntelligence(userId)
      : Promise.resolve({ available: false, reason: 'Audience intelligence is a Scale-plan feature' }),
  ]);

  const system = `You are an expert performance marketing strategist who optimizes Meta and Google ad accounts for Shopify stores. You analyze REAL campaign data (never invent numbers not present in the input) and produce grounded, actionable recommendations.
The input includes rule-of-thumb threshold signals (a simple ROAS-based heuristic already computed) as ONE input, not the final answer, plus the store's real revenue/profit context and, when available, audience intelligence. Weigh all of it together and think about actual account profitability, not just per-campaign ROAS in isolation.
Return ONLY valid JSON, no markdown, matching this exact schema:
{
  "campaigns": [
    { "campaign_id": string, "campaign_name": string, "action": "pause" | "scale" | "hold" | "adjust-audience" | "refresh-creative", "reason": string (plain English, 1-2 sentences, understandable by a non-technical Shopify store owner), "new_budget": number or null }
  ],
  "account_summary": string (2-4 sentences: is this account profitable overall once ad spend is weighed against real store revenue, what's the biggest opportunity, what's the biggest risk)
}
Every campaign_id present in the rule-based signals must appear exactly once in your campaigns array. Do not invent campaigns that are not in the input.
Writing style: write like a real strategist, not an AI. Never use em dashes (—) or arrow characters (→). Use periods, commas, or "and" to join clauses instead.`;

  const userMsg = `Rule-of-thumb threshold signals (pause below ${rules.pause_below_roas}x ROAS, scale above ${rules.scale_above_roas}x ROAS, scale multiplier ${rules.scale_multiplier}x, max daily budget $${rules.max_daily_budget}):
${JSON.stringify(ruleActions, null, 2)}

Store revenue and ad spend context (last 30 days, from connected Shopify + ad accounts):
${JSON.stringify(mrrContext, null, 2)}

Audience intelligence (${plan === 'scale' ? 'Scale plan' : 'not available on this plan'}):
${JSON.stringify(audienceIntel, null, 2)}`;

  const raw = await callClaude(userId, system, userMsg);
  let parsed: { campaigns?: unknown[]; account_summary?: string };
  try {
    const json = raw.replace(/```json\s*|```/g, '').trim();
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Failed to parse AI recommendations');
  }

  const result: AIRecommendation = {
    campaigns:       parsed.campaigns ?? [],
    account_summary: parsed.account_summary ?? '',
    model_version:   ANTHROPIC_MODEL,
    generated_at:    new Date().toISOString(),
  };

  await supabase.from('optimizer_runs').insert({
    user_id: userId,
    actions: result.campaigns,
    summary: {
      type:            'ai_analyze',
      account_summary: result.account_summary,
      model_version:   ANTHROPIC_MODEL,
      rule_summary: {
        total: ruleActions.length,
        pause: ruleActions.filter(a => a.action === 'pause').length,
        scale: ruleActions.filter(a => a.action === 'scale').length,
        hold:  ruleActions.filter(a => a.action === 'hold').length,
      },
    },
    ran_at: new Date().toISOString(),
  }).catch(() => {}); // best-effort — never fail the request over logging

  return result;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  // The UI gates ROAS Optimizer behind Growth+ (dashboard.html GATED.analytics = 'growth'),
  // but this endpoint never enforced that server-side — a Starter user calling it directly
  // could run the full analyze+apply flow, including real Meta budget/pause mutations, for
  // free. Matches the requirePlan pattern already used correctly elsewhere (meta-api, google-api).
  const planGate = await requirePlan(userId, 'growth', origin, 'ROAS optimization');
  if (planGate) return planGate;

  const rl = await rateLimitTiered(userId, 'roas', [
    { max: 5,  window: 60   },
    { max: 30, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'analyze');

  try {
    switch (action) {
      case 'analyze': {
        const token   = await getMetaToken(userId);
        if (!token)   return errResponse('Meta not connected', 403, origin);
        const budgetCheck = await checkAIBudget(userId);
        if (!budgetCheck.ok) return errResponse(budgetCheck.message, 429, origin, { usage: budgetCheck.status });
        const rules   = applyOverrides(await loadRules(userId), body);
        const actions = await analyzeCampaigns(userId, token, rules);

        const summary = {
          total: actions.length,
          pause: actions.filter(a => a.action === 'pause').length,
          scale: actions.filter(a => a.action === 'scale').length,
          hold:  actions.filter(a => a.action === 'hold').length,
        };

        let ai: AIRecommendation | null = null;
        if (ANTHROPIC_KEY && actions.length > 0) {
          try {
            ai = await generateAIRecommendations(userId, actions, rules);
          } catch (e) {
            captureError('roas-optimizer', 'roas-optimizer AI analysis failed:', e);
          }
        }

        return okResponse({ actions, summary, rules, ai }, origin);
      }

      case 'apply': {
        const token   = await getMetaToken(userId);
        if (!token)   return errResponse('Meta not connected', 403, origin);
        const rules   = applyOverrides(await loadRules(userId), body);
        const ruleActions = await analyzeCampaigns(userId, token, rules);

        // Honor the AI recommendation the user actually reviewed in the 'analyze' modal —
        // previously this independently recomputed a fresh, pure rule-based action here and
        // applied THAT, which could silently diverge from what was shown and approved (the AI
        // reasons about whole-account profitability, not just per-campaign ROAS, so it can
        // legitimately disagree with the rule engine for the same campaign). The AI's action
        // choice is trusted; the actual budget dollar amount for a "scale" is always computed
        // by the vetted formula below, never taken directly from the AI's own new_budget number.
        const aiActionsById = new Map<string, string>();
        if (ANTHROPIC_KEY && ruleActions.length > 0) {
          try {
            const ai = await generateAIRecommendations(userId, ruleActions, rules);
            for (const c of ai.campaigns) {
              const rec = c as { campaign_id?: string; action?: string };
              if (rec.campaign_id && rec.action) aiActionsById.set(rec.campaign_id, rec.action);
            }
          } catch (e) {
            captureError('roas-optimizer', 'roas-optimizer apply: AI recommendation failed, falling back to rule-based actions:', e);
          }
        }

        const planned: CampaignAction[] = ruleActions.map(ruleAction => {
          const aiAction = aiActionsById.get(ruleAction.campaign_id);
          if (!aiAction) return ruleAction; // no AI opinion for this campaign — use the vetted rule-based action
          if (aiAction === 'pause') {
            return { ...ruleAction, action: 'pause', reason: 'AI recommendation: pause' };
          }
          if (aiAction === 'scale') {
            return { ...ruleAction, action: 'scale', reason: 'AI recommendation: scale up', new_budget: computeScaledBudget(ruleAction.current_budget, rules) };
          }
          // 'hold', 'adjust-audience', 'refresh-creative' (or anything else) are not real Meta
          // mutations this endpoint can execute — treat as hold (no-op) rather than falling
          // through to whatever the rule engine independently decided.
          return { ...ruleAction, action: 'hold' };
        });

        const results: { id: string; action: string; success: boolean; error?: string }[] = [];

        await Promise.allSettled(
          planned.filter(a => a.action !== 'hold').map(async (a) => {
            try {
              if (a.action === 'pause') {
                await metaPost(`/${a.campaign_id}`, { status: 'PAUSED' }, token);
                await supabase.from('campaigns').update({ status: 'paused' })
                  .eq('id', a.campaign_id).eq('user_id', userId);
              } else if (a.action === 'scale' && a.new_budget) {
                await metaPost(`/${a.campaign_id}`, { daily_budget: String(a.new_budget) }, token);
                await supabase.from('campaigns').update({ daily_budget: a.new_budget })
                  .eq('id', a.campaign_id).eq('user_id', userId);
              }
              results.push({ id: a.campaign_id, action: a.action, success: true });
            } catch (e) {
              results.push({
                id:      a.campaign_id,
                action:  a.action,
                success: false,
                error:   e instanceof Error ? e.message : 'Unknown error',
              });
            }
          }),
        );

        // Log the optimization run
        await supabase.from('optimizer_runs').insert({
          user_id:    userId,
          actions:    results,
          summary:    { applied: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length },
          ran_at:     new Date().toISOString(),
        }).catch(() => {}); // best-effort

        const paused = results.filter(r => r.action === 'pause' && r.success).length;
        const scaled = results.filter(r => r.action === 'scale' && r.success).length;
        const failed = results.filter(r => !r.success).length;
        return okResponse({
          applied: results,
          planned,
          summary: { paused, scaled, failed, total: results.length },
        }, origin);
      }

      case 'rules': {
        // Update or create optimizer rules for this user
        const rawMultiplier   = Number(body.scale_multiplier  ?? DEFAULT_RULES.scale_multiplier);
        const rawMaxBudget    = Number(body.max_daily_budget  ?? DEFAULT_RULES.max_daily_budget);
        const rawPauseBelow   = Number(body.pause_below_roas  ?? DEFAULT_RULES.pause_below_roas);
        const rawScaleAbove   = Number(body.scale_above_roas  ?? DEFAULT_RULES.scale_above_roas);
        const rawMinSpend     = Number(body.min_spend         ?? DEFAULT_RULES.min_spend);
        const rawLookback     = Number(body.lookback_days     ?? DEFAULT_RULES.lookback_days);
        const newRules = {
          user_id:           userId,
          pause_below_roas:  Number.isFinite(rawPauseBelow) ? Math.max(rawPauseBelow, 0) : DEFAULT_RULES.pause_below_roas,
          scale_above_roas:  Number.isFinite(rawScaleAbove) ? Math.max(rawScaleAbove, 0) : DEFAULT_RULES.scale_above_roas,
          scale_multiplier:  Math.min(Math.max(rawMultiplier, 1.0), 2.0),
          max_daily_budget:  Math.min(Math.max(rawMaxBudget, 1), 10000),
          min_spend:         Number.isFinite(rawMinSpend) ? Math.max(rawMinSpend, 0) : DEFAULT_RULES.min_spend,
          lookback_days:     Number.isFinite(rawLookback) ? Math.min(Math.max(Math.round(rawLookback), 1), 90) : DEFAULT_RULES.lookback_days,
          updated_at:        new Date().toISOString(),
        };

        await supabase.from('optimizer_rules').upsert(newRules, { onConflict: 'user_id' });
        return okResponse({ rules: newRules, message: 'Optimizer rules updated' }, origin);
      }

      case 'history': {
        const { data } = await supabase
          .from('optimizer_runs')
          .select('*')
          .eq('user_id', userId)
          .order('ran_at', { ascending: false })
          .limit(20);
        return okResponse({ runs: data ?? [] }, origin);
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    // Unlike the sibling AI functions (budget-ai, competitor-radar, creative-fatigue,
    // profit-tracker), this returned the raw caught error text to the client — callClaude()
    // throws raw Anthropic error text and metaGet/metaPost throw raw Meta error text, so an
    // Anthropic overload or a Meta API failure surfaced provider-internal wording straight to
    // a Shopify store owner instead of a clean message.
    captureError('roas-optimizer', 'roas-optimizer error:', err);
    return errResponse('ROAS optimizer error', 500, origin);
  }
});
