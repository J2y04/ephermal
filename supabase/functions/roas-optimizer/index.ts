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

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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

/** Load Meta access token for user — always from DB, never from request headers */
async function getMetaToken(userId: string): Promise<string> {
  const { data } = await supabase
    .from('user_integrations')
    .select('meta_token')
    .eq('user_id', userId)
    .single();
  return data?.meta_token ?? '';
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
          const newBudget = Math.min(
            Math.round(currentBudget * rules.scale_multiplier * 100) / 100,
            rules.max_daily_budget * 100, // Meta stores budgets in cents
          );
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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

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
        const rules   = await loadRules(userId);
        const actions = await analyzeCampaigns(userId, token, rules);

        const summary = {
          total: actions.length,
          pause: actions.filter(a => a.action === 'pause').length,
          scale: actions.filter(a => a.action === 'scale').length,
          hold:  actions.filter(a => a.action === 'hold').length,
        };

        return okResponse({ actions, summary, rules }, origin);
      }

      case 'apply': {
        const token   = await getMetaToken(userId);
        if (!token)   return errResponse('Meta not connected', 403, origin);
        const rules   = await loadRules(userId);
        const planned = await analyzeCampaigns(userId, token, rules);

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
        const newRules = {
          user_id:           userId,
          pause_below_roas:  body.pause_below_roas  ?? DEFAULT_RULES.pause_below_roas,
          scale_above_roas:  body.scale_above_roas  ?? DEFAULT_RULES.scale_above_roas,
          scale_multiplier:  Math.min(Math.max(rawMultiplier, 1.0), 2.0),
          max_daily_budget:  Math.min(Math.max(rawMaxBudget, 1), 10000),
          min_spend:         body.min_spend          ?? DEFAULT_RULES.min_spend,
          lookback_days:     body.lookback_days      ?? DEFAULT_RULES.lookback_days,
          updated_at:        new Date().toISOString(),
        };

        await supabase.from('optimizer_rules').upsert(newRules, { onConflict: 'user_id' });
        return okResponse({ rules: newRules, message: 'Optimizer rules updated' }, origin);
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    console.error('roas-optimizer error:', err);
    const msg = err instanceof Error ? err.message : 'Optimizer error';
    return errResponse(msg, 500, origin);
  }
});
