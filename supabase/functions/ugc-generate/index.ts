/**
 * Ephermal — UGC + AI Content Generator (Supabase Edge Function)
 *
 * Claude Haiku-powered agent pipeline (script/copy/analysis) + real Higgsfield
 * Marketing Studio video generation.
 *
 * POST { action: 'script',          product, tone?, audience? }
 * POST { action: 'hooks',           product, count? }
 * POST { action: 'brief',           product, creator_type? }
 * POST { action: 'variations',      script, count? }
 * POST { action: 'analyze_store',   store_url?, products?, store_name? }
 * POST { action: 'profile_audience', store_analysis?, products?, niche? }
 * POST { action: 'copywrite',        product, audience?, platform? }
 * POST { action: 'full_pipeline',    product, store_analysis?, audience?, budget?, tone? }
 * POST { action: 'generate',         description, preset?, aspect_ratio? }
 * POST { action: 'create',           product_title, product_id?, product_image? }
 * POST { action: 'generate_video',   product_title, product_image?, product_description? }
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY              — claude-haiku-4-5 (script/copy/analysis)
 *   HIGGSFIELD_API_KEY             — Higgsfield API key+secret as "key:secret"
 *                                    (their documented auth header is "Key {key}:{secret}")
 *   HIGGSFIELD_MARKETING_STUDIO_MODEL — model slug for the Marketing Studio video model.
 *                                    Not publicly documented at implementation time (Higgsfield's
 *                                    public API docs only enumerate raw models like dop/standard,
 *                                    kling, seedance) — confirm the real slug from the Higgsfield
 *                                    dashboard/account and set this env var; falls back to a
 *                                    best-guess default below if unset.
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 *
 * Script credits (ugc_credits table, despite the name — text-only: script/hooks/copy/etc.)
 * and UGC video credits (ugc_video_credits table — real Higgsfield video, Growth/Scale only)
 * are two entirely separate pools, tracked and enforced independently. See generate_video
 * below and _shared reasoning in CONTEXT.md Task 18.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ANTHROPIC_KEY   = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

// Haiku 4.5 pricing (per Anthropic's published rates): $1/$5 per million input/output tokens.
// Stored in EUR at a fixed approximate rate since generation_cost_log is for margin tracking,
// not invoicing — a rough conversion is fine here, unlike Stripe amounts which use real prices.
const HAIKU_EUR_PER_INPUT_TOKEN  = 0.92 / 1_000_000;
const HAIKU_EUR_PER_OUTPUT_TOKEN = 4.6  / 1_000_000;

const HIGGSFIELD_KEY   = Deno.env.get('HIGGSFIELD_API_KEY') ?? ''; // "api_key:api_secret"
const HIGGSFIELD_BASE  = 'https://platform.higgsfield.ai';
const HIGGSFIELD_MODEL = Deno.env.get('HIGGSFIELD_MARKETING_STUDIO_MODEL') ?? 'higgsfield-ai/marketing-studio/video';
const HIGGSFIELD_POLL_INTERVAL_MS = 4000;
const HIGGSFIELD_POLL_TIMEOUT_MS  = 150_000; // Marketing Studio ads (script+scenes+voiceover) run longer than a raw clip
// Used only when Higgsfield's response doesn't include a credits/cost field for that generation —
// our real Ultra-plan per-video cost, so margin math still has a number instead of a gap.
const HIGGSFIELD_FALLBACK_COST_EUR = 2.48;

// UGC script generation credits per plan (separate from AI chat message credits in ai_credits
// table, AND separate from real video credits in ugc_video_credits below — this table is
// named ugc_credits for historical reasons but only ever covers text: script/hooks/copy/etc.)
const PLAN_LIMITS: Record<string, number> = { starter: 15, growth: 75, scale: 350 };

// Real UGC video ad credits per plan — Growth/Scale only, Starter stays script-only.
const UGC_VIDEO_PLAN_LIMITS: Record<string, number> = { starter: 0, growth: 18, scale: 32 };

// Applied to every prompt in this file — ad copy and UGC scripts go live in front of
// real customers, so they must read as human-written, not AI-generated.
const STYLE_GUARD = '\n\nWriting style: write like a real copywriter, not an AI. Never use em dashes (—) or arrow characters (→). Use periods, commas, or "and" to join clauses instead.';

/** Best-effort cost-log write — never throws, never blocks generation on failure. */
async function logGenerationCost(row: {
  userId: string; plan: string; creditType: 'script' | 'ugc_video';
  provider: 'anthropic' | 'higgsfield'; providerModel?: string;
  providerUnits?: number; costEur: number; action: string;
}): Promise<void> {
  try {
    const { error } = await supabase.from('generation_cost_log').insert({
      user_id: row.userId, plan: row.plan, credit_type: row.creditType,
      provider: row.provider, provider_model: row.providerModel ?? null,
      provider_units: row.providerUnits ?? null, cost_eur: row.costEur, action: row.action,
    });
    if (error) console.warn('generation_cost_log insert failed (non-fatal):', error.message);
  } catch (e) {
    console.warn('generation_cost_log insert threw (non-fatal):', e);
  }
}

async function callAI(
  system: string, user: string, maxTokens = 1500,
  logCtx?: { userId: string; plan: string; action: string },
): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('AI not configured. Set ANTHROPIC_API_KEY');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system:     system + STYLE_GUARD,
      messages:   [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json() as {
    content: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (logCtx && data.usage) {
    const inTok  = data.usage.input_tokens  ?? 0;
    const outTok = data.usage.output_tokens ?? 0;
    const costEur = inTok * HAIKU_EUR_PER_INPUT_TOKEN + outTok * HAIKU_EUR_PER_OUTPUT_TOKEN;
    await logGenerationCost({
      userId: logCtx.userId, plan: logCtx.plan, creditType: 'script', provider: 'anthropic',
      providerModel: ANTHROPIC_MODEL, providerUnits: inTok + outTok, costEur, action: logCtx.action,
    });
  }
  return data.content?.find(c => c.type === 'text')?.text ?? '';
}

/**
 * Submits a Marketing Studio video generation job to Higgsfield and polls until it
 * completes. Higgsfield's public API is async: POST to submit, then GET-poll a status
 * URL until status flips to "completed" (or "failed"). See file header for the
 * HIGGSFIELD_MARKETING_STUDIO_MODEL slug caveat.
 */
async function generateHiggsfieldVideo(params: {
  productTitle: string; productImage?: string; productDescription?: string;
}): Promise<{ videoUrl: string; higgsfieldCreditCost: number | null; requestId: string }> {
  if (!HIGGSFIELD_KEY) throw new Error('Video generation not configured. Set HIGGSFIELD_API_KEY');

  const authHeader = `Key ${HIGGSFIELD_KEY}`;
  const submitRes = await fetch(`${HIGGSFIELD_BASE}/${HIGGSFIELD_MODEL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({
      prompt: `Product ad for: ${params.productTitle}. ${params.productDescription ?? ''}`.trim(),
      product_image_url: params.productImage || undefined,
      aspect_ratio: '9:16',
      duration: 15,
      resolution: '1080p',
    }),
  });
  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    throw new Error(`Higgsfield submit failed: ${(err as { message?: string }).message ?? submitRes.status}`);
  }
  const submitData = await submitRes.json() as { request_id?: string; status_url?: string };
  const requestId = submitData.request_id;
  if (!requestId) throw new Error('Higgsfield did not return a request_id');

  const statusUrl = submitData.status_url ?? `${HIGGSFIELD_BASE}/requests/${requestId}/status`;
  const deadline = Date.now() + HIGGSFIELD_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, HIGGSFIELD_POLL_INTERVAL_MS));
    const pollRes = await fetch(statusUrl, { headers: { 'Authorization': authHeader } });
    if (!pollRes.ok) continue; // transient — keep polling until deadline
    const pollData = await pollRes.json() as {
      status?: string; video?: { url: string }; error?: string;
      credits_used?: number; credit_cost?: number;
    };
    if (pollData.status === 'completed' && pollData.video?.url) {
      const higgsfieldCreditCost = pollData.credits_used ?? pollData.credit_cost ?? null;
      return { videoUrl: pollData.video.url, higgsfieldCreditCost, requestId };
    }
    if (pollData.status === 'failed' || pollData.status === 'error') {
      throw new Error(pollData.error ?? 'Higgsfield generation failed');
    }
    // queued / processing — keep polling
  }
  throw new Error('Higgsfield generation timed out');
}

async function getUsage(userId: string) {
  const month = new Date().toISOString().slice(0, 7);
  const [planRes, creditsRes] = await Promise.all([
    supabase.from('user_plans').select('plan').eq('user_id', userId).single(),
    supabase.from('ugc_credits').select('used').eq('user_id', userId).eq('month', month).single(),
  ]);
  const plan  = planRes.data?.plan ?? 'starter';
  const used  = creditsRes.data?.used ?? 0;
  const limit = PLAN_LIMITS[plan] ?? 15;
  return { plan, used, limit };
}

/** Best-effort refund of one credit after a claimed slot's generation actually failed —
 *  without this, an Anthropic API error (rate limit, timeout, outage) burned a credit for
 *  nothing, silently shrinking the user's real remaining allowance. Same optimistic-lock
 *  style as claimUsageSlot; a rare race under heavy concurrent use just means the refund
 *  is skipped that one time, which is a far smaller problem than never refunding at all. */
async function refundUsageSlot(userId: string): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  try {
    const { data } = await supabase.from('ugc_credits')
      .select('used').eq('user_id', userId).eq('month', month).maybeSingle();
    const current = data?.used ?? 0;
    if (current <= 0) return;
    await supabase.from('ugc_credits')
      .update({ used: current - 1 })
      .eq('user_id', userId).eq('month', month).eq('used', current);
  } catch (e) {
    console.warn('ugc-generate: credit refund failed (non-fatal):', e);
  }
}

/** Atomically claim one credit. Returns false if the limit was already reached concurrently. */
async function claimUsageSlot(userId: string, currentUsed: number, limit: number): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7);
  if (currentUsed === 0) {
    // First use this month — try an INSERT to race-safely claim slot 1
    const { error } = await supabase.from('ugc_credits')
      .insert({ user_id: userId, month, used: 1 });
    if (!error) return true;
    // Conflict = another request inserted first; fall through to update path
  }
  // Optimistic update: increment only if value hasn't changed since we read it
  const { data } = await supabase.from('ugc_credits')
    .update({ used: currentUsed + 1 })
    .eq('user_id', userId)
    .eq('month', month)
    .eq('used', currentUsed)  // lost-write check
    .lt('used', limit)         // hard limit check
    .select('used');
  return Array.isArray(data) && data.length > 0;
}

// ── UGC video credits (separate pool — Growth/Scale only) ─────────────────────

type TopupRow = { id: string; credits: number; used: number };

async function getVideoUsage(userId: string, plan: string) {
  const month = new Date().toISOString().slice(0, 7);
  const [creditsRes, topupsRes] = await Promise.all([
    supabase.from('ugc_video_credits').select('used').eq('user_id', userId).eq('month', month).maybeSingle(),
    supabase.from('ugc_video_topups').select('id, credits, used').eq('user_id', userId).order('created_at', { ascending: true }),
  ]);
  const used    = creditsRes.data?.used ?? 0;
  const limit   = UGC_VIDEO_PLAN_LIMITS[plan] ?? 0;
  const topups  = (topupsRes.data ?? []) as TopupRow[];
  const topupRemaining = topups.reduce((sum, t) => sum + Math.max(0, t.credits - t.used), 0);
  return { used, limit, topups, topupRemaining };
}

/**
 * Atomically claim one UGC video credit: monthly allowance first, then oldest
 * top-up pack with remaining balance (FIFO). Returns which pool was charged so
 * a failed generation can be refunded to the exact same place.
 */
async function claimVideoSlot(
  userId: string, used: number, limit: number, topups: TopupRow[],
): Promise<{ claimed: boolean; source: 'monthly' | 'topup' | null; topupId?: string }> {
  const month = new Date().toISOString().slice(0, 7);

  if (used < limit) {
    if (used === 0) {
      const { error } = await supabase.from('ugc_video_credits').insert({ user_id: userId, month, used: 1 });
      if (!error) return { claimed: true, source: 'monthly' };
      // Conflict = another request inserted first; fall through to update path
    }
    const { data } = await supabase.from('ugc_video_credits')
      .update({ used: used + 1 })
      .eq('user_id', userId).eq('month', month)
      .eq('used', used).lt('used', limit)
      .select('used');
    if (Array.isArray(data) && data.length > 0) return { claimed: true, source: 'monthly' };
    // Lost the race and monthly is now exhausted — fall through to top-ups.
  }

  // Monthly allowance exhausted — spend the oldest top-up pack with remaining balance.
  for (const t of topups) {
    if (t.credits - t.used <= 0) continue;
    const { data } = await supabase.from('ugc_video_topups')
      .update({ used: t.used + 1 })
      .eq('id', t.id).eq('used', t.used)
      .select('id');
    if (Array.isArray(data) && data.length > 0) return { claimed: true, source: 'topup', topupId: t.id };
  }
  return { claimed: false, source: null };
}

/** Mirrors refundUsageSlot for the video pool — refunds to whichever pool was actually charged. */
async function refundVideoSlot(userId: string, source: 'monthly' | 'topup', topupId?: string): Promise<void> {
  try {
    if (source === 'monthly') {
      const month = new Date().toISOString().slice(0, 7);
      const { data } = await supabase.from('ugc_video_credits')
        .select('used').eq('user_id', userId).eq('month', month).maybeSingle();
      const current = data?.used ?? 0;
      if (current <= 0) return;
      await supabase.from('ugc_video_credits')
        .update({ used: current - 1 })
        .eq('user_id', userId).eq('month', month).eq('used', current);
    } else if (topupId) {
      const { data } = await supabase.from('ugc_video_topups').select('used').eq('id', topupId).maybeSingle();
      const current = data?.used ?? 0;
      if (current <= 0) return;
      await supabase.from('ugc_video_topups')
        .update({ used: current - 1 })
        .eq('id', topupId).eq('used', current);
    }
  } catch (e) {
    console.warn('ugc-generate: video credit refund failed (non-fatal):', e);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'ugc', [
    { max: 5,  window: 60   },
    { max: 30, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'script');

  // assign_campaign bypasses credit check — it just updates a DB record
  if (action === 'assign_campaign') {
    const creativeId = String(body.creative_id ?? '').trim();
    const campaignId = String(body.campaign_id ?? '').trim() || null;
    if (!creativeId) return errResponse('creative_id is required', 400, origin);
    if (campaignId) {
      // Verify the target campaign is one this user actually owns before linking a
      // creative to it — same ownership scoping already used for creativeId below.
      const { data: ownedCampaign } = await supabase
        .from('launched_campaigns')
        .select('id')
        .eq('id', campaignId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!ownedCampaign) return errResponse('campaign_id not found', 404, origin);
    }
    const { error } = await supabase
      .from('creatives')
      .update({ campaign_id: campaignId })
      .eq('id', creativeId)
      .eq('user_id', userId);
    if (error) {
      console.error('ugc-generate assign_campaign error:', error);
      return errResponse('Failed to save creative', 500, origin);
    }
    return okResponse({ success: true }, origin);
  }

  // ── generate_video — real Higgsfield video, entirely separate credit pool ────
  // Deliberately handled before the script-credit gate below: this action must never
  // touch ugc_credits (script credits), and Starter (limit 0) is rejected outright.
  if (action === 'generate_video') {
    if (!HIGGSFIELD_KEY) return errResponse('Video generation not configured. Set HIGGSFIELD_API_KEY', 503, origin);

    const productTitle       = String(body.product_title ?? '').trim();
    const productImage       = String(body.product_image ?? '');
    const productDescription = String(body.product_description ?? '');
    if (!productTitle) return errResponse('product_title is required', 400, origin);

    const { data: planRow } = await supabase.from('user_plans').select('plan').eq('user_id', userId).single();
    const plan = planRow?.plan ?? 'starter';

    const { used: vUsed, limit: vLimit, topups, topupRemaining } = await getVideoUsage(userId, plan);
    if (vUsed >= vLimit && topupRemaining <= 0) {
      return errResponse(
        vLimit === 0
          ? 'UGC video generation is available on Growth and Scale plans.'
          : `Out of UGC video credits (${vLimit}/month used). Top up: 5 credits for €35, or 15 for €105.`,
        429, origin,
        { out_of_credits: true, topup_prices: { pack_5_eur: 35, pack_15_eur: 105, per_credit_eur: 7 } },
      );
    }

    // Claim BEFORE calling Higgsfield, refund on failure — net effect is "charged only on
    // success" (matches Higgsfield's own pattern) while staying race-safe under concurrent
    // requests, same approach already used for script credits above.
    const claim = await claimVideoSlot(userId, vUsed, vLimit, topups);
    if (!claim.claimed) {
      return errResponse(
        `Out of UGC video credits (${vLimit}/month used). Top up: 5 credits for €35, or 15 for €105.`,
        429, origin,
        { out_of_credits: true, topup_prices: { pack_5_eur: 35, pack_15_eur: 105, per_credit_eur: 7 } },
      );
    }

    try {
      const { videoUrl, higgsfieldCreditCost, requestId } = await generateHiggsfieldVideo({
        productTitle, productImage, productDescription,
      });

      const costEur = higgsfieldCreditCost != null
        ? higgsfieldCreditCost * (HIGGSFIELD_FALLBACK_COST_EUR) // credits × our per-credit rate
        : HIGGSFIELD_FALLBACK_COST_EUR;                          // no cost field returned — use flat fallback

      await logGenerationCost({
        userId, plan, creditType: 'ugc_video', provider: 'higgsfield',
        providerModel: HIGGSFIELD_MODEL, providerUnits: higgsfieldCreditCost ?? undefined,
        costEur, action: 'generate_video',
      });

      const { data: creative, error: creativeErr } = await supabase.from('creatives').insert({
        id:        crypto.randomUUID(),
        user_id:   userId,
        headline:  productTitle.slice(0, 255),
        body:      productDescription.slice(0, 500),
        type:      'ugc_video',
        status:    'pending_review',
        meta_data: { video_url: videoUrl, higgsfield_request_id: requestId, product_title: productTitle, product_image: productImage },
      }).select('id').single();
      // Previously this only logged and kept going, returning "success" with the video URL but
      // no saved creative row - the user was told "check Creatives" and found nothing there,
      // with a video credit already spent for a result they can never see again (no video_url
      // was returned to persist client-side either). A generation that can't be saved is not a
      // successful generation.
      if (creativeErr) {
        console.error('ugc-generate generate_video creatives insert error:', creativeErr.message);
        throw new Error('Video generated but failed to save - please try again');
      }

      return okResponse({
        creative_id: creative?.id, video_url: videoUrl, status: 'pending_review',
        credit_source: claim.source, used: vUsed + 1, limit: vLimit, topup_remaining: topupRemaining - (claim.source === 'topup' ? 1 : 0),
      }, origin);
    } catch (err) {
      console.error('ugc-generate generate_video error:', err);
      await refundVideoSlot(userId, claim.source!, claim.topupId);
      return errResponse('Video generation failed', 500, origin);
    }
  }

  if (!ANTHROPIC_KEY) return errResponse('AI not configured. Set ANTHROPIC_API_KEY', 503, origin);

  const { used, limit, plan } = await getUsage(userId);
  if (used >= limit) {
    return errResponse(`AI message limit reached (${limit}/month). Top up in billing.`, 429, origin);
  }

  // Atomically claim the slot BEFORE calling the AI — prevents concurrent over-use
  const claimed = await claimUsageSlot(userId, used, limit);
  if (!claimed) {
    return errResponse(`AI message limit reached (${limit}/month). Top up in billing.`, 429, origin);
  }

  const logCtx = { userId, plan, action };

  try {
    let result: unknown;

    switch (action) {
      // ── EXISTING ACTIONS ────────────────────────────────────────────────────

      case 'script': {
        const product  = body.product as Record<string, unknown> ?? {};
        const tone     = String(body.tone ?? 'authentic and relatable');
        const audience = String(body.audience ?? 'general consumers');
        const system = `You are an expert UGC scriptwriter for Meta and TikTok ads.
Write scripts that feel like genuine customer reviews, not polished commercials.
Structure: Hook (3-5 sec), then Problem, then Solution/Product, then Proof, then CTA.
Keep total script under 60 seconds (~130 words/min).
Return JSON: { hook, problem, solution, proof, cta, full_script, estimated_duration_seconds }
Return ONLY valid JSON.`;
        const reply = await callAI(system, `Product: ${JSON.stringify(product)}\nTone: ${tone}\nAudience: ${audience}\nWrite a UGC-style ad script.`, 1200, logCtx);

        try { result = JSON.parse(reply); } catch { result = { full_script: reply }; }
        break;
      }

      case 'hooks': {
        const product = body.product as Record<string, unknown> ?? {};
        const rawCount = Number(body.count);
        const count   = Math.max(1, Math.min(Number.isFinite(rawCount) ? rawCount : 5, 10));
        const system = `You are a viral hook writer for UGC ads.
Write ${count} hook variations. Each 1-2 sentences, under 10 seconds when spoken.
Use diverse angles: problem-first, curiosity, controversy, social proof, transformation.
Return a JSON array: [{ "hook": "...", "angle": "problem|curiosity|controversy|social_proof|transformation" }]
Return ONLY valid JSON.`;
        const reply = await callAI(system, `Product: ${JSON.stringify(product)}`, 800, logCtx);

        try { result = JSON.parse(reply); } catch { result = [{ hook: reply, angle: 'general' }]; }
        break;
      }

      case 'brief': {
        const product     = body.product as Record<string, unknown> ?? {};
        const creatorType = String(body.creator_type ?? 'lifestyle creator');
        const system = `You are a UGC creative director writing a creator brief.
Write a clear brief for a ${creatorType} to film a 30-60 second ad.
Return JSON: { overview, target_audience, key_messages: string[], hooks_to_try: string[], do_list: string[], dont_list: string[], cta, filming_tips }
Return ONLY valid JSON.`;
        const reply = await callAI(system, `Product: ${JSON.stringify(product)}`, 1500, logCtx);

        try { result = JSON.parse(reply); } catch { result = { overview: reply }; }
        break;
      }

      case 'variations': {
        const script = String(body.script ?? '').trim();
        if (!script) return errResponse('script is required', 400, origin);
        const rawCount = Number(body.count);
        const count = Math.max(1, Math.min(Number.isFinite(rawCount) ? rawCount : 3, 5));
        const system = `You are a UGC ad scriptwriter creating A/B test variations.
Rewrite the given script ${count} times with different angle or tone.
Keep the core message and CTA. Return a JSON array: [{ "variation": 1, "label": "...", "script": "..." }]
Return ONLY valid JSON.`;
        const reply = await callAI(system, `Original script:\n${script}`, 1800, logCtx);

        try { result = JSON.parse(reply); } catch { result = [{ variation: 1, label: 'Variation A', script: reply }]; }
        break;
      }

      // ── NEW AI-POWERED ACTIONS ────────────────────────────────────────────

      case 'analyze_store': {
        const storeUrl   = String(body.store_url ?? '');
        const products   = body.products as unknown[] ?? [];
        const storeName  = String(body.store_name ?? '');
        const system = `You are an expert Shopify store analyst and Meta/Google Ads strategist.
Analyze the provided store information and return structured insights.
Return JSON: {
  summary: string,
  niche: string,
  price_tier: "budget|mid|premium|luxury",
  brand_voice: string,
  target_audience: string,
  top_products: string[],
  key_differentiators: string[],
  ad_opportunities: string[],
  meta_strategy: string,
  google_strategy: string,
  estimated_cpa: number,
  roas_target_90d: number,
  ugc_themes: string[]
}
Return ONLY valid JSON.`;
        const userMsg = `Store: ${storeName || storeUrl || 'Unknown store'}
Products sample: ${JSON.stringify(products.slice(0, 10))}
Analyze and provide marketing insights.`;
        const reply = await callAI(system, userMsg, 1500, logCtx);

        try { result = JSON.parse(reply); } catch { result = { summary: reply }; }
        break;
      }

      case 'profile_audience': {
        const storeAnalysis = body.store_analysis as Record<string, unknown> ?? {};
        const niche         = String(body.niche ?? storeAnalysis.niche ?? 'e-commerce');
        const system = `You are an expert media buyer and audience strategist.
Create detailed audience segments for Meta Ads and Google Ads targeting.
Return JSON array of 3-5 segments:
[{
  name: string,
  description: string,
  age_range: { min: number, max: number },
  gender: "all|male|female",
  interests: string[],
  pain_points: string[],
  buying_triggers: string[],
  meta_interests: { id: string, name: string }[],
  google_in_market: string[],
  estimated_size: "small(<100k)|medium(100k-1m)|large(>1m)",
  recommended_budget_pct: number
}]
Return ONLY valid JSON.`;
        const userMsg = `Niche: ${niche}
Store analysis: ${JSON.stringify(storeAnalysis)}
Create audience segments for paid ads.`;
        const reply = await callAI(system, userMsg, 1500, logCtx);

        try { result = JSON.parse(reply); } catch { result = []; }
        break;
      }

      case 'copywrite': {
        const product  = body.product as Record<string, unknown> ?? {};
        const audience = body.audience as Record<string, unknown> ?? {};
        const platform = String(body.platform ?? 'both');
        const system = `You are an elite ad copywriter. Write high-converting ad copy.
Return JSON:
{
  "meta": {
    "primary_text": string (max 125 chars),
    "headline": string (max 40 chars),
    "description": string (max 30 chars),
    "cta": "SHOP_NOW|LEARN_MORE|SIGN_UP|GET_OFFER",
    "variations": [{ primary_text, headline }]
  },
  "google": {
    "headlines": string[] (15 items, max 30 chars each),
    "descriptions": string[] (4 items, max 90 chars each),
    "callouts": string[] (8 items, max 25 chars each),
    "sitelinks": [{ title: string, description: string, url_suffix: string }]
  }
}
Return ONLY valid JSON.`;
        const userMsg = `Product: ${JSON.stringify(product)}
Target audience: ${JSON.stringify(audience)}
Platform: ${platform}
Write launch-ready ad copy.`;
        const reply = await callAI(system, userMsg, 1200, logCtx);

        try { result = JSON.parse(reply); } catch { result = {}; }
        break;
      }

      case 'full_pipeline': {
        const product  = body.product as Record<string, unknown> ?? {};
        const tone     = String(body.tone ?? 'authentic and benefit-focused');
        const budget   = Number(body.budget ?? 20);

        // Step 1: store analysis (if not provided)
        let storeAnalysis = body.store_analysis as Record<string, unknown> ?? null;
        if (!storeAnalysis) {
          const analysisReply = await callAI(
            `Analyze this product for Meta/Google advertising. Return JSON: { niche, target_audience, key_differentiators: string[], ad_opportunities: string[], meta_strategy, ugc_themes: string[] }. ONLY JSON.`,
            `Product: ${JSON.stringify(product)}`,
            800,
            logCtx,
          );
          try { storeAnalysis = JSON.parse(analysisReply); } catch { storeAnalysis = {}; }
        }

        // Step 2: audience segments
        const audienceReply = await callAI(
          `Create 2 audience segments for this product. Return JSON array: [{ name, description, age_range: {min,max}, interests: string[], pain_points: string[] }]. ONLY JSON.`,
          `Product: ${JSON.stringify(product)}\nNiche: ${storeAnalysis?.niche ?? 'e-commerce'}`,
          600,
          logCtx,
        );
        let audiences: unknown[];
        try { audiences = JSON.parse(audienceReply); } catch { audiences = []; }

        // Step 3: UGC script
        const scriptReply = await callAI(
          `Write a UGC ad script. Return JSON: { hook, problem, solution, proof, cta, full_script, estimated_duration_seconds }. ONLY JSON.`,
          `Product: ${JSON.stringify(product)}\nTone: ${tone}\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`,
          900,
          logCtx,
        );
        let script: Record<string, unknown>;
        try { script = JSON.parse(scriptReply); } catch { script = { full_script: scriptReply }; }

        // Step 4: ad copy
        const copyReply = await callAI(
          `Write Meta and Google ad copy. Return JSON: { meta: { primary_text, headline, description, cta }, google: { headlines: string[], descriptions: string[] } }. ONLY JSON.`,
          `Product: ${JSON.stringify(product)}\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`,
          800,
          logCtx,
        );
        let copy: Record<string, unknown>;
        try { copy = JSON.parse(copyReply); } catch { copy = {}; }


        result = { store_analysis: storeAnalysis, audiences, script, copy, budget_suggestion: { daily: budget, meta_pct: 65, google_pct: 35 } };
        break;
      }

      // ── DASHBOARD ACTIONS ───────────────────────────────────────────────────
      // Called by the UGC modal (submitUGC) and new-product prompt (createUGCForNewProduct)

      case 'generate': {
        const desc        = String(body.description ?? '').trim();
        const preset      = String(body.preset ?? 'authentic');
        const aspectRatio = String(body.aspect_ratio ?? '9:16');
        if (!desc) return errResponse('description is required', 400, origin);

        const analysisReply = await callAI(
          `Analyze this product for Meta/Google advertising. Return JSON: { niche, target_audience, key_differentiators: string[], ad_opportunities: string[], meta_strategy, ugc_themes: string[] }. ONLY JSON.`,
          `Product: ${desc}`, 600, logCtx,
        );
        let storeAnalysis: Record<string, unknown>;
        try { storeAnalysis = JSON.parse(analysisReply); } catch { storeAnalysis = {}; }

        const audienceReply = await callAI(
          `Create 2 audience segments. Return JSON array: [{ name, description, age_range: {min,max}, interests: string[], pain_points: string[] }]. ONLY JSON.`,
          `Product: ${desc}\nNiche: ${storeAnalysis.niche ?? 'e-commerce'}`, 500, logCtx,
        );
        let audiences: unknown[];
        try { audiences = JSON.parse(audienceReply); } catch { audiences = []; }

        const scriptReply = await callAI(
          `Write a UGC ad script. Return JSON: { hook, problem, solution, proof, cta, full_script, estimated_duration_seconds }. ONLY JSON.`,
          `Product: ${desc}\nTone: authentic and benefit-focused\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`, 800, logCtx,
        );
        let script: Record<string, unknown>;
        try { script = JSON.parse(scriptReply); } catch { script = { full_script: scriptReply }; }

        const copyReply = await callAI(
          `Write Meta and Google ad copy. Return JSON: { meta: { primary_text, headline, description, cta }, google: { headlines: string[], descriptions: string[] } }. ONLY JSON.`,
          `Product: ${desc}\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`, 700, logCtx,
        );
        let copy: Record<string, unknown>;
        try { copy = JSON.parse(copyReply); } catch { copy = {}; }

        const { data: creative, error: creativeErr } = await supabase.from('creatives').insert({
          id:        crypto.randomUUID(),
          user_id:   userId,
          headline:  String(script.hook ?? '').slice(0, 255) || desc.slice(0, 100),
          body:      String((copy.meta as Record<string, unknown>)?.primary_text ?? '').slice(0, 500),
          type:      'ugc',
          status:    'pending_review',
          meta_data: { script, copy, audiences, preset, aspect_ratio: aspectRatio, product_description: desc },
        }).select('id').single();
        // Same "silent save failure charged a credit for nothing" bug fixed for generate_video
        // above - the frontend told the user "check Creatives" while nothing was actually there.
        if (creativeErr) {
          console.error('ugc-generate creatives insert error:', creativeErr.message);
          throw new Error('Generated but failed to save - please try again');
        }

        result = { creative_id: creative?.id, script, copy, audiences, status: 'pending_review' };
        break;
      }

      case 'create': {
        const productTitle = String(body.product_title ?? '').trim();
        const productImage = String(body.product_image ?? '');
        const productId    = String(body.product_id ?? '');
        if (!productTitle) return errResponse('product_title is required', 400, origin);

        const analysisReply = await callAI(
          `Analyze this product for Meta/Google advertising. Return JSON: { niche, target_audience, key_differentiators: string[], ad_opportunities: string[], meta_strategy, ugc_themes: string[] }. ONLY JSON.`,
          `Product title: ${productTitle}`, 600, logCtx,
        );
        let storeAnalysis: Record<string, unknown>;
        try { storeAnalysis = JSON.parse(analysisReply); } catch { storeAnalysis = {}; }

        const audienceReply = await callAI(
          `Create 2 audience segments. Return JSON array: [{ name, description, age_range: {min,max}, interests: string[], pain_points: string[] }]. ONLY JSON.`,
          `Product: ${productTitle}\nNiche: ${storeAnalysis.niche ?? 'e-commerce'}`, 500, logCtx,
        );
        let audiences: unknown[];
        try { audiences = JSON.parse(audienceReply); } catch { audiences = []; }

        const scriptReply = await callAI(
          `Write a UGC ad script. Return JSON: { hook, problem, solution, proof, cta, full_script, estimated_duration_seconds }. ONLY JSON.`,
          `Product: ${productTitle}\nTone: authentic and benefit-focused\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`, 800, logCtx,
        );
        let script: Record<string, unknown>;
        try { script = JSON.parse(scriptReply); } catch { script = { full_script: scriptReply }; }

        const copyReply = await callAI(
          `Write Meta and Google ad copy. Return JSON: { meta: { primary_text, headline, description, cta }, google: { headlines: string[], descriptions: string[] } }. ONLY JSON.`,
          `Product: ${productTitle}\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`, 700, logCtx,
        );
        let copy: Record<string, unknown>;
        try { copy = JSON.parse(copyReply); } catch { copy = {}; }

        const { data: creative, error: creativeErr } = await supabase.from('creatives').insert({
          id:        crypto.randomUUID(),
          user_id:   userId,
          headline:  String(script.hook ?? '').slice(0, 255) || productTitle.slice(0, 100),
          body:      String((copy.meta as Record<string, unknown>)?.primary_text ?? '').slice(0, 500),
          type:      'ugc',
          status:    'pending_review',
          meta_data: { script, copy, audiences, product_id: productId, product_title: productTitle, product_image: productImage },
        }).select('id').single();
        if (creativeErr) {
          console.error('ugc-generate creatives insert error:', creativeErr.message);
          throw new Error('Generated but failed to save - please try again');
        }

        result = { creative_id: creative?.id, script, copy, audiences, status: 'pending_review' };
        break;
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }

    return okResponse({ result, used: used + 1, limit }, origin);
  } catch (err) {
    console.error('ugc-generate error:', err);
    // The credit was already claimed before this try block ran — refund it since the
    // generation itself never actually happened.
    await refundUsageSlot(userId);
    return errResponse('Generation error', 500, origin);
  }
});
