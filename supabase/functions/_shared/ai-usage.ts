/**
 * Ephermal — AI usage tracking (shared)
 *
 * Real, cost-based replacement for the old ai_credits "AI messages" system.
 * Every Anthropic call's actual token usage is converted to real USD cost
 * using each model's real per-token pricing, tracked per user per ISO week,
 * and shown to the user as a percentage of their plan's weekly budget —
 * the same mental model as Claude's own usage meter, not a message counter.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { captureError } from './sentry.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// $ per million tokens — real Anthropic pricing, checked live 2026-07-31.
// Update these if Anthropic changes pricing; everything downstream (budgets,
// percentages, top-up prices) derives from these two numbers, not from a
// hardcoded "message" concept.
//
// claude-sonnet-5's $2/$10 rate is Anthropic's introductory price, valid through
// 2026-08-31 — the standard rate after that is $3/$15. Update the sonnet-5 row
// above that date or every call after it will undercount real cost by ~33%.
const MODEL_RATES_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5':           { input: 2, output: 10 },
};

// Real weekly $ cost budget per plan — deliberately generous relative to
// typical usage (Claude-style: the meter should rarely max out for a normal
// user), while still keeping AI cost under ~5% of plan revenue, so margin on
// the included budget alone is >90% even at 100% utilization every week.
export const PLAN_WEEKLY_BUDGET_USD: Record<string, number> = {
  starter: 1.00,
  growth:  2.50,
  scale:   5.00,
};

/** Lifetime ceiling for a test user, in real USD of Anthropic spend.
 *
 *  The weekly budget resets every Monday, which is correct for a paying
 *  customer and wrong for someone on a free comped plan: "Growth free for three
 *  months" would otherwise mean thirteen consecutive weekly budgets, about $32
 *  of real spend per tester, times however many testers we onboard.
 *
 *  $10 is roughly four full Growth weeks. Nobody evaluating a product burns
 *  four weeks of heavy AI usage deciding whether they like it, so this should
 *  never be reached by a genuine tester, while capping worst-case exposure at
 *  a known number per head instead of an open tab. Raise it here if a tester
 *  legitimately hits it — it is one constant, deliberately. */
export const TESTER_LIFETIME_BUDGET_USD = 10.00;

/** ISO 8601 week key, e.g. "2026-W05" — Monday-start week. Same format the
 *  old ai_credits system used, so no user-visible reset-timing change. */
export function isoWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Compute real USD cost (as integer micros, USD * 1e6) for one Anthropic call. */
export function computeCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_RATES_PER_MILLION[model] ?? MODEL_RATES_PER_MILLION['claude-haiku-4-5-20251001'];
  const usd = (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
  return Math.round(usd * 1_000_000);
}

/** Record real usage from one Anthropic response. Fire-and-forget is NOT used
 *  deliberately — callers await this so a DB failure surfaces rather than
 *  silently under-counting cost. */
export async function recordAIUsage(
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const costMicros = computeCostMicros(model, inputTokens, outputTokens);
  const totalTokens = inputTokens + outputTokens;
  const { error } = await supabase.rpc('increment_ai_usage_cost', {
    p_user_id:     userId,
    p_period:      isoWeekKey(),
    p_tokens:      totalTokens,
    p_cost_micros: costMicros,
  });
  if (error) captureError('_shared/ai-usage', '[ai-usage] increment_ai_usage_cost failed:', error.message);
}

export interface AIUsageStatus {
  plan: string;
  period: string;
  tokensUsed: number;
  costUsedUsd: number;
  baseBudgetUsd: number;
  topupUsd: number;
  totalBudgetUsd: number;
  percentUsed: number; // 0-100+, can exceed 100 if over budget
  overBudget: boolean;
  // Test users only. A paying customer has no lifetime ceiling, so these are
  // false/0/null for everyone else and the UI hides the second meter entirely.
  isTester: boolean;
  lifetimeUsedUsd: number;
  lifetimeBudgetUsd: number | null;
  lifetimePercentUsed: number;
  lifetimeExhausted: boolean;
}

/** Full usage status for the current week — this is what the frontend meter renders. */
export async function getAIUsageStatus(userId: string): Promise<AIUsageStatus> {
  const period = isoWeekKey();
  const [planRes, usageRes, topupsRes, allTimeRes] = await Promise.all([
    supabase.from('user_plans').select('plan, is_tester').eq('user_id', userId).single(),
    supabase.from('ai_usage').select('tokens_used, cost_used_micros').eq('user_id', userId).eq('period', period).maybeSingle(),
    supabase.from('ai_usage_topups').select('extra_cost_micros').eq('user_id', userId).eq('period', period),
    // One row per ISO week, so this is a handful of rows even for a tester who
    // stays the full three months. Summed here rather than in an RPC to keep
    // the lifetime rule in the same file as the weekly one.
    supabase.from('ai_usage').select('cost_used_micros').eq('user_id', userId),
  ]);

  const plan = planRes.data?.plan ?? 'starter';
  const isTester = planRes.data?.is_tester === true;
  const lifetimeUsedUsd = (allTimeRes.data ?? [])
    .reduce((sum, r) => sum + (r.cost_used_micros ?? 0), 0) / 1_000_000;
  const lifetimeBudgetUsd = isTester ? TESTER_LIFETIME_BUDGET_USD : null;
  const lifetimePercentUsed = lifetimeBudgetUsd
    ? Math.round((lifetimeUsedUsd / lifetimeBudgetUsd) * 1000) / 10
    : 0;
  const baseBudgetUsd = PLAN_WEEKLY_BUDGET_USD[plan] ?? PLAN_WEEKLY_BUDGET_USD.starter;
  const topupUsd = (topupsRes.data ?? []).reduce((sum, t) => sum + t.extra_cost_micros, 0) / 1_000_000;
  const totalBudgetUsd = baseBudgetUsd + topupUsd;
  const costUsedUsd = (usageRes.data?.cost_used_micros ?? 0) / 1_000_000;
  const percentUsed = totalBudgetUsd > 0 ? Math.round((costUsedUsd / totalBudgetUsd) * 1000) / 10 : 0;

  return {
    plan,
    period,
    tokensUsed: usageRes.data?.tokens_used ?? 0,
    costUsedUsd,
    baseBudgetUsd,
    topupUsd,
    totalBudgetUsd,
    percentUsed,
    overBudget: costUsedUsd >= totalBudgetUsd,
    isTester,
    lifetimeUsedUsd,
    lifetimeBudgetUsd,
    lifetimePercentUsed,
    lifetimeExhausted: lifetimeBudgetUsd !== null && lifetimeUsedUsd >= lifetimeBudgetUsd,
  };
}

/** Pre-call gate — check BEFORE spending money on an Anthropic call, not just
 *  after. Returns null if OK to proceed, or a user-facing error message if
 *  the user is already over budget. */
export async function checkAIBudget(userId: string): Promise<{ ok: true; status: AIUsageStatus } | { ok: false; status: AIUsageStatus; message: string }> {
  const status = await getAIUsageStatus(userId);

  // Lifetime ceiling is checked first and deliberately does NOT mention topping
  // up: a tester cannot buy their way past it, and offering an upsell that does
  // not apply would be a worse answer than the honest one.
  if (status.lifetimeExhausted) {
    return {
      ok: false,
      status,
      message: `Your tester AI allowance is used up (${status.lifetimeUsedUsd.toFixed(2)} of ${status.lifetimeBudgetUsd?.toFixed(2)} USD). Everything else still works. Message Jamal if you need more to finish testing.`,
    };
  }

  if (status.overBudget) {
    return {
      ok: false,
      status,
      message: `You've used your AI usage for this week (${status.percentUsed}%). Buy more usage in Settings or wait for your weekly reset.`,
    };
  }
  return { ok: true, status };
}

// Top-up percentages and their real prices (EUR), ~4x actual USD cost —
// generous margin, still cheap in absolute terms for the user. Computed
// server-side from PLAN_WEEKLY_BUDGET_USD so there's one source of truth
// instead of a second hand-maintained price table drifting out of sync.
const TOPUP_MARKUP_MULTIPLIER = 4;
const USD_TO_EUR = 0.92; // conservative fixed rate; revisit if it drifts significantly

export const TOPUP_PERCENTS = [25, 50, 75, 100] as const;

/** Real USD cost added to the budget by a topup of this percent, for this plan. */
export function topupCostUsd(plan: string, percent: number): number {
  const base = PLAN_WEEKLY_BUDGET_USD[plan] ?? PLAN_WEEKLY_BUDGET_USD.starter;
  return Math.round(base * (percent / 100) * 100) / 100;
}

/** What the user pays (EUR cents, for Stripe) for a topup of this percent, for this plan. */
export function topupPriceEurCents(plan: string, percent: number): number {
  const costUsd = topupCostUsd(plan, percent);
  const priceEur = costUsd * TOPUP_MARKUP_MULTIPLIER * USD_TO_EUR;
  // Round up to the nearest 0.50 EUR for a clean displayed price.
  const rounded = Math.ceil(priceEur * 2) / 2;
  return Math.round(rounded * 100);
}
