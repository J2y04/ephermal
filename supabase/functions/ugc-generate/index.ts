/**
 * Ephermal — UGC Generator Edge Function
 *
 * Generates UGC-style ad scripts and briefs using Claude.
 * Does NOT generate actual video — it produces the script, hook,
 * talking points, and CTA that a creator would record.
 *
 * POST { action: 'script',     product, tone?, audience? }  — full video script
 * POST { action: 'hooks',      product, count? }             — 5–10 hook variations
 * POST { action: 'brief',      product, creator_type? }      — creator brief PDF-ready
 * POST { action: 'variations', script, count? }              — A/B variation rewrites
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-sonnet-4-5';

// Plan → monthly AI message limits (shared with ai-assistant)
const PLAN_LIMITS: Record<string, number> = {
  starter: 50,
  growth:  200,
  scale:   500,
};

async function callClaude(system: string, user: string, maxTokens = 1500): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Claude error ${res.status}`);
  }

  const data = await res.json() as { content: { type: string; text: string }[] };
  return data.content.find(b => b.type === 'text')?.text ?? '';
}

async function getUsage(userId: string): Promise<{ used: number; limit: number }> {
  const month = new Date().toISOString().slice(0, 7);
  const [planRes, creditsRes] = await Promise.all([
    supabase.from('user_plans').select('plan').eq('user_id', userId).single(),
    supabase.from('ai_credits').select('used').eq('user_id', userId).eq('month', month).single(),
  ]);
  const plan  = planRes.data?.plan ?? 'starter';
  const used  = creditsRes.data?.used ?? 0;
  const limit = PLAN_LIMITS[plan] ?? 50;
  return { used, limit };
}

async function incrementUsage(userId: string, currentUsed: number): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await supabase.from('ai_credits').upsert(
    { user_id: userId, month, used: currentUsed + 1 },
    { onConflict: 'user_id,month' },
  );
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  if (!ANTHROPIC_KEY) return errResponse('AI not configured', 503, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'script');

  // Usage gate
  const { used, limit } = await getUsage(userId);
  if (used >= limit) {
    return errResponse(`AI message limit reached (${limit}/month). Upgrade in billing.`, 429, origin);
  }

  try {
    let result: unknown;

    switch (action) {
      case 'script': {
        const product  = body.product  as Record<string, unknown> ?? {};
        const tone     = String(body.tone ?? 'authentic and relatable');
        const audience = String(body.audience ?? 'general consumers');

        const system = `You are an expert UGC (User-Generated Content) scriptwriter for Meta and TikTok ads.
Write scripts that feel like genuine customer reviews — not polished commercials.
Structure: Hook (3–5 sec) → Problem → Solution/Product → Proof → CTA.
Keep total script under 60 seconds when read at normal pace (~130 words/min).
Return JSON with:
- hook: (string) opening line — attention-grabbing, pattern-interrupt
- problem: (string) relatable pain point
- solution: (string) how the product solves it
- proof: (string) result or transformation
- cta: (string) clear call to action
- full_script: (string) complete script with natural transitions
- estimated_duration_seconds: (number)
Return ONLY valid JSON.`;

        const userMsg = `Product: ${JSON.stringify(product)}
Tone: ${tone}
Target audience: ${audience}
Write a UGC-style ad script.`;

        const reply = await callClaude(system, userMsg, 1200);
        await incrementUsage(userId, used);
        try { result = JSON.parse(reply); } catch { result = { full_script: reply }; }
        break;
      }

      case 'hooks': {
        const product = body.product as Record<string, unknown> ?? {};
        const count   = Math.min(Number(body.count ?? 5), 10);

        const system = `You are a viral hook writer for UGC ads on Meta and TikTok.
Write ${count} different hook variations for the same product.
Each hook must be 1–2 sentences, under 10 seconds when spoken.
Use diverse angles: problem-first, curiosity, controversy, social proof, transformation.
Return a JSON array of objects: [{ "hook": "...", "angle": "problem|curiosity|controversy|social_proof|transformation" }]
Return ONLY valid JSON.`;

        const reply = await callClaude(system, `Product: ${JSON.stringify(product)}`, 800);
        await incrementUsage(userId, used);
        try { result = JSON.parse(reply); } catch { result = [{ hook: reply, angle: 'general' }]; }
        break;
      }

      case 'brief': {
        const product      = body.product as Record<string, unknown> ?? {};
        const creatorType  = String(body.creator_type ?? 'lifestyle creator');

        const system = `You are a UGC creative director writing a creator brief.
Write a clear, friendly brief that a ${creatorType} can follow to film a 30–60 second ad.
Return JSON with:
- overview: (string) 2-3 sentences about the brand and product
- target_audience: (string) who to speak to and how
- key_messages: (string[]) 3–5 bullet points to communicate
- hooks_to_try: (string[]) 3 opening lines they can choose from
- do_list: (string[]) 5 things to DO in the video
- dont_list: (string[]) 5 things to AVOID
- cta: (string) exact words to say at the end
- filming_tips: (string) lighting, setting, style guidance
Return ONLY valid JSON.`;

        const reply = await callClaude(system, `Product: ${JSON.stringify(product)}`, 1500);
        await incrementUsage(userId, used);
        try { result = JSON.parse(reply); } catch { result = { overview: reply }; }
        break;
      }

      case 'variations': {
        const script = String(body.script ?? '').trim();
        if (!script) return errResponse('script is required', 400, origin);
        const count = Math.min(Number(body.count ?? 3), 5);

        const system = `You are a UGC ad scriptwriter creating A/B test variations.
Rewrite the given script ${count} times, each with a different angle or tone.
Keep the core message and CTA but vary: the hook, pacing, emotional tone, or specific proof points.
Return a JSON array: [{ "variation": 1, "label": "...", "script": "..." }]
Return ONLY valid JSON.`;

        const reply = await callClaude(system, `Original script:\n${script}`, 1800);
        await incrementUsage(userId, used);
        try { result = JSON.parse(reply); } catch { result = [{ variation: 1, label: 'Variation A', script: reply }]; }
        break;
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }

    return okResponse({ result, used: used + 1, limit }, origin);

  } catch (err) {
    console.error('ugc-generate error:', err);
    const msg = err instanceof Error ? err.message : 'UGC generation error';
    return errResponse(msg, 500, origin);
  }
});
