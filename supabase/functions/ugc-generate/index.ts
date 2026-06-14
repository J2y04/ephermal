/**
 * Ephermal — UGC + AI Content Generator (Supabase Edge Function)
 *
 * Groq-powered agent pipeline using llama-3.3-70b-versatile.
 * Falls back to Anthropic claude-sonnet-4-5 if GROQ_API_KEY is not set.
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
 *
 * Required env vars:
 *   GROQ_API_KEY         — llama-3.3-70b-versatile
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const GROQ_KEY   = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// UGC generation credits per plan (separate from AI chat message credits in ai_credits table)
const PLAN_LIMITS: Record<string, number> = { starter: 15, growth: 75, scale: 350 };

async function callAI(system: string, user: string, maxTokens = 1500): Promise<string> {
  if (!GROQ_KEY) throw new Error('AI not configured — set GROQ_API_KEY');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
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

  if (!GROQ_KEY) return errResponse('AI not configured — set GROQ_API_KEY', 503, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'script');

  // assign_campaign bypasses credit check — it just updates a DB record
  if (action === 'assign_campaign') {
    const creativeId = String(body.creative_id ?? '').trim();
    const campaignId = String(body.campaign_id ?? '').trim() || null;
    if (!creativeId) return errResponse('creative_id is required', 400, origin);
    const { error } = await supabase
      .from('creatives')
      .update({ campaign_id: campaignId })
      .eq('id', creativeId)
      .eq('user_id', userId);
    if (error) return errResponse(error.message, 500, origin);
    return okResponse({ success: true }, origin);
  }

  const { used, limit } = await getUsage(userId);
  if (used >= limit) {
    return errResponse(`AI message limit reached (${limit}/month). Top up in billing.`, 429, origin);
  }

  // Atomically claim the slot BEFORE calling the AI — prevents concurrent over-use
  const claimed = await claimUsageSlot(userId, used, limit);
  if (!claimed) {
    return errResponse(`AI message limit reached (${limit}/month). Top up in billing.`, 429, origin);
  }

  try {
    let result: unknown;

    switch (action) {
      // ── EXISTING ACTIONS ────────────────────────────────────────────────────

      case 'script': {
        const product  = body.product as Record<string, unknown> ?? {};
        const tone     = String(body.tone ?? 'authentic and relatable');
        const audience = String(body.audience ?? 'general consumers');
        const system = `You are an expert UGC scriptwriter for Meta and TikTok ads.
Write scripts that feel like genuine customer reviews — not polished commercials.
Structure: Hook (3-5 sec) → Problem → Solution/Product → Proof → CTA.
Keep total script under 60 seconds (~130 words/min).
Return JSON: { hook, problem, solution, proof, cta, full_script, estimated_duration_seconds }
Return ONLY valid JSON.`;
        const reply = await callAI(system, `Product: ${JSON.stringify(product)}\nTone: ${tone}\nAudience: ${audience}\nWrite a UGC-style ad script.`, 1200);

        try { result = JSON.parse(reply); } catch { result = { full_script: reply }; }
        break;
      }

      case 'hooks': {
        const product = body.product as Record<string, unknown> ?? {};
        const count   = Math.min(Number(body.count ?? 5), 10);
        const system = `You are a viral hook writer for UGC ads.
Write ${count} hook variations. Each 1-2 sentences, under 10 seconds when spoken.
Use diverse angles: problem-first, curiosity, controversy, social proof, transformation.
Return a JSON array: [{ "hook": "...", "angle": "problem|curiosity|controversy|social_proof|transformation" }]
Return ONLY valid JSON.`;
        const reply = await callAI(system, `Product: ${JSON.stringify(product)}`, 800);

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
        const reply = await callAI(system, `Product: ${JSON.stringify(product)}`, 1500);

        try { result = JSON.parse(reply); } catch { result = { overview: reply }; }
        break;
      }

      case 'variations': {
        const script = String(body.script ?? '').trim();
        if (!script) return errResponse('script is required', 400, origin);
        const count = Math.min(Number(body.count ?? 3), 5);
        const system = `You are a UGC ad scriptwriter creating A/B test variations.
Rewrite the given script ${count} times with different angle or tone.
Keep the core message and CTA. Return a JSON array: [{ "variation": 1, "label": "...", "script": "..." }]
Return ONLY valid JSON.`;
        const reply = await callAI(system, `Original script:\n${script}`, 1800);

        try { result = JSON.parse(reply); } catch { result = [{ variation: 1, label: 'Variation A', script: reply }]; }
        break;
      }

      // ── NEW GROQ-POWERED ACTIONS ────────────────────────────────────────────

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
        const reply = await callAI(system, userMsg, 1500);

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
        const reply = await callAI(system, userMsg, 1500);

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
        const reply = await callAI(system, userMsg, 1200);

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
          );
          try { storeAnalysis = JSON.parse(analysisReply); } catch { storeAnalysis = {}; }
        }

        // Step 2: audience segments
        const audienceReply = await callAI(
          `Create 2 audience segments for this product. Return JSON array: [{ name, description, age_range: {min,max}, interests: string[], pain_points: string[] }]. ONLY JSON.`,
          `Product: ${JSON.stringify(product)}\nNiche: ${storeAnalysis?.niche ?? 'e-commerce'}`,
          600,
        );
        let audiences: unknown[];
        try { audiences = JSON.parse(audienceReply); } catch { audiences = []; }

        // Step 3: UGC script
        const scriptReply = await callAI(
          `Write a UGC ad script. Return JSON: { hook, problem, solution, proof, cta, full_script, estimated_duration_seconds }. ONLY JSON.`,
          `Product: ${JSON.stringify(product)}\nTone: ${tone}\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`,
          900,
        );
        let script: Record<string, unknown>;
        try { script = JSON.parse(scriptReply); } catch { script = { full_script: scriptReply }; }

        // Step 4: ad copy
        const copyReply = await callAI(
          `Write Meta and Google ad copy. Return JSON: { meta: { primary_text, headline, description, cta }, google: { headlines: string[], descriptions: string[] } }. ONLY JSON.`,
          `Product: ${JSON.stringify(product)}\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`,
          800,
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
          `Product: ${desc}`, 600,
        );
        let storeAnalysis: Record<string, unknown>;
        try { storeAnalysis = JSON.parse(analysisReply); } catch { storeAnalysis = {}; }

        const audienceReply = await callAI(
          `Create 2 audience segments. Return JSON array: [{ name, description, age_range: {min,max}, interests: string[], pain_points: string[] }]. ONLY JSON.`,
          `Product: ${desc}\nNiche: ${storeAnalysis.niche ?? 'e-commerce'}`, 500,
        );
        let audiences: unknown[];
        try { audiences = JSON.parse(audienceReply); } catch { audiences = []; }

        const scriptReply = await callAI(
          `Write a UGC ad script. Return JSON: { hook, problem, solution, proof, cta, full_script, estimated_duration_seconds }. ONLY JSON.`,
          `Product: ${desc}\nTone: authentic and benefit-focused\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`, 800,
        );
        let script: Record<string, unknown>;
        try { script = JSON.parse(scriptReply); } catch { script = { full_script: scriptReply }; }

        const copyReply = await callAI(
          `Write Meta and Google ad copy. Return JSON: { meta: { primary_text, headline, description, cta }, google: { headlines: string[], descriptions: string[] } }. ONLY JSON.`,
          `Product: ${desc}\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`, 700,
        );
        let copy: Record<string, unknown>;
        try { copy = JSON.parse(copyReply); } catch { copy = {}; }

        const { data: creative } = await supabase.from('creatives').insert({
          user_id:   userId,
          headline:  String(script.hook ?? '').slice(0, 255) || desc.slice(0, 100),
          body:      String((copy.meta as Record<string, unknown>)?.primary_text ?? '').slice(0, 500),
          type:      'ugc',
          status:    'pending_review',
          meta_data: { script, copy, audiences, preset, aspect_ratio: aspectRatio, product_description: desc },
        }).select('id').single();


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
          `Product title: ${productTitle}`, 600,
        );
        let storeAnalysis: Record<string, unknown>;
        try { storeAnalysis = JSON.parse(analysisReply); } catch { storeAnalysis = {}; }

        const audienceReply = await callAI(
          `Create 2 audience segments. Return JSON array: [{ name, description, age_range: {min,max}, interests: string[], pain_points: string[] }]. ONLY JSON.`,
          `Product: ${productTitle}\nNiche: ${storeAnalysis.niche ?? 'e-commerce'}`, 500,
        );
        let audiences: unknown[];
        try { audiences = JSON.parse(audienceReply); } catch { audiences = []; }

        const scriptReply = await callAI(
          `Write a UGC ad script. Return JSON: { hook, problem, solution, proof, cta, full_script, estimated_duration_seconds }. ONLY JSON.`,
          `Product: ${productTitle}\nTone: authentic and benefit-focused\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`, 800,
        );
        let script: Record<string, unknown>;
        try { script = JSON.parse(scriptReply); } catch { script = { full_script: scriptReply }; }

        const copyReply = await callAI(
          `Write Meta and Google ad copy. Return JSON: { meta: { primary_text, headline, description, cta }, google: { headlines: string[], descriptions: string[] } }. ONLY JSON.`,
          `Product: ${productTitle}\nAudience: ${JSON.stringify((audiences as Record<string, unknown>[])[0] ?? {})}`, 700,
        );
        let copy: Record<string, unknown>;
        try { copy = JSON.parse(copyReply); } catch { copy = {}; }

        const { data: creative } = await supabase.from('creatives').insert({
          user_id:   userId,
          headline:  String(script.hook ?? '').slice(0, 255) || productTitle.slice(0, 100),
          body:      String((copy.meta as Record<string, unknown>)?.primary_text ?? '').slice(0, 500),
          type:      'ugc',
          status:    'pending_review',
          meta_data: { script, copy, audiences, product_id: productId, product_title: productTitle, product_image: productImage },
        }).select('id').single();


        result = { creative_id: creative?.id, script, copy, audiences, status: 'pending_review' };
        break;
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }

    return okResponse({ result, used: used + 1, limit }, origin);
  } catch (err) {
    console.error('ugc-generate error:', err);
    return errResponse(err instanceof Error ? err.message : 'Generation error', 500, origin);
  }
});
