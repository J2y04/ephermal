/**
 * Ephermal — Plan-tier gating (shared)
 *
 * The client-side `canAccess()` / `GATED` dict in dashboard.html is UX only —
 * it decides what renders, nothing more (same pattern as admin/layout.tsx's
 * documented client gate). This module is what actually stops a Starter user
 * from calling a Growth/Scale-only edge function directly (curl, a modified
 * fetch, or a tampered client), bypassing the UI paywall entirely.
 *
 * Usage in a handler, right after extractUserId():
 *
 *   const gate = await requirePlan(userId, 'growth', origin, 'competitor radar');
 *   if (gate) return gate;
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errResponse } from './auth.ts';

const PLAN_RANK: Record<string, number> = { starter: 0, growth: 1, scale: 2 };

let _supabase: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }
  return _supabase;
}

/** Current plan tier for a user. Defaults to 'starter' when no row exists yet —
 *  matches the seed row every signup gets from clerk-webhook, and fails closed
 *  (lowest tier) rather than open if the row is somehow missing. */
export async function getPlan(userId: string): Promise<string> {
  try {
    const { data } = await getClient()
      .from('user_plans')
      .select('plan')
      .eq('user_id', userId)
      .single();
    return (data?.plan as string) ?? 'starter';
  } catch {
    // A transient DB/network failure fails closed to the lowest tier — a
    // real Growth/Scale user sees an upgrade prompt instead of a 500, and
    // no one gets accidental access to a gated feature.
    return 'starter';
  }
}

/**
 * Returns null when the user's plan meets minPlan (caller proceeds normally),
 * otherwise a ready-to-return 403 Response naming the required tier.
 * featureLabel is a short lowercase noun phrase, e.g. "competitor radar",
 * "the profit tracker" — it's spliced directly into "Upgrade to X to access {featureLabel}".
 */
export async function requirePlan(
  userId: string,
  minPlan: 'growth' | 'scale',
  origin: string | null,
  featureLabel: string,
): Promise<Response | null> {
  const plan = await getPlan(userId);
  if ((PLAN_RANK[plan] ?? 0) >= PLAN_RANK[minPlan]) return null;
  const tierName = minPlan === 'scale' ? 'Scale' : 'Growth';
  return errResponse(`Upgrade to ${tierName} to access ${featureLabel}`, 403, origin);
}
