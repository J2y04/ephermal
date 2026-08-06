/**
 * Ephermal — Creative Fatigue Edge Function
 *
 * Fetches launched creatives from DB + Meta insights, computes fatigue
 * scores server-side, and persists results to creative_fatigue table.
 *
 * Called by:
 *   POST /creative-fatigue  (no body required — uses Clerk JWT for user)
 *   Also called internally by meta-api after creative sync.
 *
 * Fatigue score 0–100:
 *   frequency > 3.5  → +35 pts
 *   CTR decline > 20% → +25 pts
 *   ROAS decline > 25% → +20 pts
 *   Age > 21 days     → +10 pts
 *   Impressions > 50k → +10 pts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { metaGet, CAMPAIGN_INSIGHT_FIELDS, parseROAS } from '../_shared/meta.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface Creative {
  id: string;
  user_id: string;
  account_id: string | null;
  headline: string | null;
  type: string;
  impressions: number;
  clicks: number;
  ctr: number;
  roas: number;
  frequency: number;
  created_at: string;
  campaign_id: string | null;
  meta_data: Record<string, unknown> | null;
  stale?: boolean;
}

interface FatigueResult {
  creative_id: string;
  user_id: string;
  score: number;
  level: 'ok' | 'warn' | 'critical';
  signals: string[];
  recommendation: string;
  stale?: boolean;
}

function computeScore(c: Creative): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // Frequency — strongest fatigue signal
  const freq = c.frequency ?? 0;
  if (freq >= 5)        { score += 35; signals.push(`Freq ${freq.toFixed(1)}×`); }
  else if (freq >= 3.5) { score += 20; signals.push(`Freq ${freq.toFixed(1)}×`); }
  else if (freq >= 2.5) { score += 8; }

  // CTR (absolute threshold — below 0.5% is concerning)
  const ctr = c.ctr ?? 0;
  if (ctr < 0.3 && c.impressions > 5000) { score += 20; signals.push(`CTR ${ctr.toFixed(2)}%`); }
  else if (ctr < 0.7 && c.impressions > 10000) { score += 10; signals.push(`Low CTR`); }

  // ROAS
  const roas = c.roas ?? 0;
  if (roas > 0 && roas < 1.5) { score += 20; signals.push(`ROAS ${roas.toFixed(1)}×`); }
  else if (roas > 0 && roas < 2.5) { score += 8; }

  // Creative age
  if (c.created_at) {
    const days = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
    if (days > 30) { score += 10; signals.push(`${days}d running`); }
    else if (days > 21) { score += 5; signals.push(`${days}d running`); }
  }

  // Impressions volume
  const imp = c.impressions ?? 0;
  if (imp > 100_000) { score += 10; signals.push(`${(imp / 1000).toFixed(0)}k impr`); }
  else if (imp > 50_000) { score += 5; }

  return { score: Math.min(100, score), signals };
}

function level(score: number): 'ok' | 'warn' | 'critical' {
  if (score >= 65) return 'critical';
  if (score >= 35) return 'warn';
  return 'ok';
}

function recommendation(score: number): string {
  if (score >= 65) return 'Pause immediately — severe audience fatigue. Replace or refresh this creative.';
  if (score >= 35) return 'Monitor closely — declining performance. A/B test a new variant within 3–5 days.';
  return 'Healthy — creative performing well. No action needed.';
}

/** Enrich creatives with Meta insights (frequency, updated CTR/ROAS) */
async function enrichFromMeta(
  creatives: Creative[],
  token: string,
): Promise<Creative[]> {
  if (!token) return creatives;

  return Promise.all(
    creatives.map(async (c) => {
      if (!c.campaign_id) return c;
      try {
        const res = await metaGet<{ data: { frequency: string; ctr: string; spend: string; impressions: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] }[] }>(
          `/${c.campaign_id}/insights`,
          {
            fields:       'frequency,ctr,spend,impressions,actions,action_values',
            date_preset:  'last_14d',
          },
          token,
        );
        const ins = res.data?.[0];
        if (!ins) return c;
        const spend = parseFloat(ins.spend ?? '0');
        return {
          ...c,
          frequency:   parseFloat(ins.frequency ?? String(c.frequency)),
          ctr:         parseFloat(ins.ctr ?? String(c.ctr)),
          roas:        spend > 0 ? parseROAS(ins.actions ?? [], ins.action_values ?? [], ins.spend) : c.roas,
          impressions: parseInt(ins.impressions ?? String(c.impressions), 10),
        };
      } catch (e) {
        // Silently returning the stale, previously-stored metrics with no trace makes a fatigue
        // score for this creative indistinguishable from a fully-live computation, even though
        // it may be based on data that's days or weeks old (rate limit, invalid/archived
        // campaign_id, or a transient Meta API/network error).
        console.warn(`[creative-fatigue] Meta insights fetch failed for creative ${c.id} (campaign ${c.campaign_id}), using stale cached metrics:`, e);
        return { ...c, stale: true };
      }
    }),
  );
}

/** Best-effort fatigue alert — awaited, matches the same pattern as stripe-webhook's
 *  plan_activated/ai_topup_receipt emails rather than fire-and-forget. */
async function sendFatigueAlertEmail(userId: string, count: number): Promise<void> {
  try {
    const secret = Deno.env.get('CLERK_SECRET_KEY');
    if (!secret) return;
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${secret}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return;
    const user = await res.json() as { email_addresses?: { id: string; email_address: string }[]; primary_email_address_id?: string };
    const email = user.email_addresses?.find(e => e.id === user.primary_email_address_id)?.email_address;
    if (!email) return;

    const emailRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        template: 'fatigue_alert',
        to: email,
        vars: { name: 'there', count: String(count) },
      }),
    });
    // fetch() only rejects on network failure, not on an HTTP error status — without this check
    // a user with real ad fatigue who should be alerted gets nothing, with zero trace in logs.
    if (!emailRes.ok) console.error(`fatigue_alert email failed for ${userId}: ${emailRes.status} ${await emailRes.text().catch(() => '')}`);
  } catch (e) {
    console.warn('fatigue_alert email failed (non-fatal):', e);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return errResponse('Method not allowed', 405, origin);
  }

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'fatigue', [
    { max: 5,  window: 60   },
    { max: 30, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  // Load launched creatives and the Meta token in parallel — neither depends on the other's
  // result (the token read only needs userId), so awaiting them sequentially was adding one
  // avoidable extra round trip to every fatigue-analysis request before enrichFromMeta even
  // started. Meta token always from DB — never from request headers.
  const [{ data: creatives, error: dbErr }, { data: _tokenRow }] = await Promise.all([
    supabase.from('creatives').select('*').eq('user_id', userId).in('status', ['launched', 'approved']),
    supabase.from('user_integrations').select('meta_token').eq('user_id', userId).single(),
  ]);

  if (dbErr) {
    console.error('creative-fatigue creatives fetch error:', dbErr);
    return errResponse('Failed to load fatigue data', 500, origin);
  }
  if (!creatives?.length) {
    return okResponse({ results: [], message: 'No launched creatives found' }, origin);
  }

  const metaToken = _tokenRow?.meta_token ?? '';

  // Enrich with live Meta insights if token available
  const enriched = await enrichFromMeta(creatives as Creative[], metaToken || '');

  // Compute scores
  const results: FatigueResult[] = enriched.map(c => {
    const { score, signals } = computeScore(c);
    return {
      creative_id:    c.id,
      user_id:        userId,
      score,
      level:          level(score),
      signals,
      recommendation: recommendation(score),
      ...(c.stale ? { stale: true } : {}),
    };
  });

  // Snapshot the previous levels before overwriting, so the alert email only fires for
  // creatives that are *newly* critical this run — not every time the user reopens this
  // page while an already-known-critical creative is still sitting there.
  const { data: previousRows } = await supabase
    .from('creative_fatigue')
    .select('creative_id, level')
    .eq('user_id', userId);
  const previousCriticalIds = new Set((previousRows ?? []).filter(r => r.level === 'critical').map(r => r.creative_id));
  const newlyCritical = results.filter(r => r.level === 'critical' && !previousCriticalIds.has(r.creative_id));

  // Persist to creative_fatigue table — the table has no `stale` column, so strip it before
  // upserting; it's a response-only marker for the caller, not something we persist.
  await supabase.from('creative_fatigue').upsert(
    results.map(({ stale: _stale, ...r }) => ({ ...r, computed_at: new Date().toISOString() })),
    { onConflict: 'creative_id,user_id' },
  );

  if (newlyCritical.length > 0) {
    await sendFatigueAlertEmail(userId, newlyCritical.length);
  }

  // Also update fatigue_score column on creatives table
  await Promise.allSettled(
    results.map(r =>
      supabase.from('creatives')
        .update({ fatigue_score: r.score })
        .eq('id', r.creative_id)
        .eq('user_id', userId),
    ),
  );

  const critical = results.filter(r => r.level === 'critical').length;
  const warn     = results.filter(r => r.level === 'warn').length;

  return okResponse({
    results: results.sort((a, b) => b.score - a.score),
    summary: { total: results.length, critical, warn, ok: results.length - critical - warn },
  }, origin);
});
