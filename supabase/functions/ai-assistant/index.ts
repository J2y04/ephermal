/**
 * Ephermal — AI Assistant Edge Function
 *
 * Powers the in-dashboard AI chat and store analysis.
 * Uses llama-3.3-70b-versatile via Groq API.
 *
 * POST /ai-assistant  { action: 'chat', message: string, context?: object }
 * POST /ai-assistant  { action: 'analyze', url: string }
 * POST /ai-assistant  { action: 'generate_description', product: object }
 *
 * Required env vars:
 *   GROQ_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse, bodyTooLarge } from '../_shared/rate-limit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const GROQ_KEY  = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL     = 'llama-3.3-70b-versatile';

// Plan → monthly AI message limits
const PLAN_LIMITS: Record<string, number> = {
  starter: 50,
  growth:  200,
  scale:   500,
};

const STYLE_GUARD = '\n\nWriting style: write like a real advertising consultant, not an AI. Never use em dashes (—) or arrow characters (→). Use periods, commas, or "and" to join clauses instead.';

/** Call Groq API (OpenAI-compatible) */
async function callGroq(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024,
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt + STYLE_GUARD },
        { role: 'user',   content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Groq error ${res.status}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

/** Get user's plan and current AI usage */
async function getUsage(userId: string): Promise<{ plan: string; used: number; limit: number }> {
  const month = new Date().toISOString().slice(0, 7);

  const [planRes, creditsRes] = await Promise.all([
    supabase.from('user_plans').select('plan').eq('user_id', userId).single(),
    supabase.from('ai_credits').select('used').eq('user_id', userId).eq('month', month).single(),
  ]);

  const plan  = planRes.data?.plan ?? 'starter';
  const used  = creditsRes.data?.used ?? 0;
  const limit = PLAN_LIMITS[plan] ?? 50;

  return { plan, used, limit };
}

/**
 * Atomically increment AI usage. Returns new count, or null if limit already hit.
 * Uses a DB-level atomic increment to prevent race conditions from concurrent requests.
 */
async function atomicIncrementUsage(userId: string, limit: number): Promise<number | null> {
  const month = new Date().toISOString().slice(0, 7);

  // Ensure row exists first (upsert with 0 if new)
  await supabase.from('ai_credits').upsert(
    { user_id: userId, month, used: 0 },
    { onConflict: 'user_id,month', ignoreDuplicates: true },
  );

  // Atomic conditional increment: only increments if used < limit
  const { data, error } = await supabase.rpc('increment_ai_usage', {
    p_user_id: userId,
    p_month:   month,
    p_limit:   limit,
  });

  if (error) {
    // Fail closed — if usage tracking is broken, block the request rather than give free access
    console.error('atomicIncrementUsage error:', error);
    return null;
  }

  return data as number | null; // null = limit already hit; number = new count
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  // ── Rate limiting: 10/min burst, 100/hour sustained ─────────────────────
  const rl = await rateLimitTiered(userId, 'ai', [
    { max: 10,  window: 60   },
    { max: 100, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  // ── Body size guard (64 KB max) ──────────────────────────────────────────
  if (bodyTooLarge(req, 65_536)) return errResponse('Request body too large', 413, origin);

  if (!GROQ_KEY) return errResponse('AI not configured. Set GROQ_API_KEY', 503, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'chat');

  // ── Atomic monthly usage check + increment ───────────────────────────────
  const { plan } = await getUsage(userId);
  const limit = PLAN_LIMITS[plan] ?? 50;
  const newCount = await atomicIncrementUsage(userId, limit);
  if (newCount === null) {
    return errResponse(`AI message limit reached (${limit}/month). Top up in billing.`, 429, origin);
  }

  try {
    let result: unknown;

    switch (action) {
      case 'chat': {
        const message = String(body.message ?? '').trim();
        if (!message) return errResponse('message is required', 400, origin);

        const contextStr = body.context
          ? `\n\nDashboard context: ${JSON.stringify(body.context, null, 2)}`
          : '';

        const system = `You are Ephermal's AI advertising expert, an elite Meta Ads and Shopify growth specialist.
You help Shopify store owners maximize ROAS, reduce wasted ad spend, and scale winning campaigns.
Be concise, data-driven, and actionable. When asked about performance, give specific recommendations.
Never make up data — if context data is provided, reference it; otherwise, give best-practice advice.${contextStr}`;

        const reply = await callGroq(system, message, 1024);
        result = { reply, used: newCount, limit };
        break;
      }

      case 'analyze': {
        const url = String(body.url ?? '').trim();
        if (!url) return errResponse('url is required', 400, origin);

        const system = `You are an expert Shopify store analyst and Meta Ads strategist.
Analyze the provided store URL and return a structured JSON object with these exact keys:
- summary: 2-3 sentence overview of the store
- target_audience: who the ideal customer is
- ad_opportunities: top 3 advertising opportunities
- meta_strategy: recommended Meta Ads approach
- products: array of 3-5 key product categories/items
- estimated_cpa: rough CPA estimate for the niche
- roas_target: realistic ROAS target for first 90 days
Return ONLY valid JSON, no markdown.`;

        const reply = await callGroq(system, `Analyze this Shopify store: ${url}`, 1500);
        try {
          result = JSON.parse(reply);
        } catch {
          result = { summary: reply, target_audience: '', ad_opportunities: '', meta_strategy: '', products: [] };
        }
        break;
      }

      case 'generate_description': {
        const product = body.product as Record<string, unknown> ?? {};
        const system = `You are an expert copywriter for Meta Ads. Write high-converting ad copy.
Return a JSON object with: headline (max 40 chars), primary_text (max 125 chars), description (max 30 chars).
Make it punchy, benefit-focused, and scroll-stopping. Return ONLY valid JSON.`;

        const reply = await callGroq(
          system,
          `Write Meta ad copy for this product: ${JSON.stringify(product)}`,
          512,
        );
        try {
          result = JSON.parse(reply);
        } catch {
          result = { headline: String(product.title ?? ''), primary_text: reply, description: '' };
        }
        break;
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }

    return okResponse(result, origin);

  } catch (err) {
    console.error('ai-assistant error:', err);
    const msg = err instanceof Error ? err.message : 'AI error';
    return errResponse(msg, 500, origin);
  }
});
