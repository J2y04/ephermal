/**
 * Ephermal — Creative Brief Generator (Supabase Edge Function)
 *
 * AI-powered ad creative brief generation using llama-3.3-70b-versatile on Groq.
 * Reads user's products and campaigns from DB, generates structured creative briefs.
 *
 * POST { action: 'generate' } — generate a new creative brief from store data
 * POST { action: 'history' } — return last 5 briefs for the user
 *
 * Required env vars:
 *   GROQ_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const GROQ_KEY   = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

async function callGroq(system: string, user: string, maxTokens = 2000): Promise<string> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY not configured');
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

async function handleGenerate(userId: string): Promise<Record<string, unknown>> {
  // Fetch top 5 products by price_cents
  const { data: products } = await supabase
    .from('shopify_products')
    .select('title, price_cents, inventory_count')
    .eq('user_id', userId)
    .order('price_cents', { ascending: false })
    .limit(5);

  // Fetch recent campaigns for ROAS data
  const { data: campaigns } = await supabase
    .from('launched_campaigns')
    .select('name, objective, budget_daily, status, copy')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  const productList = (products ?? []).map(p => ({
    title: p.title,
    price_usd: ((p.price_cents ?? 0) / 100).toFixed(2),
    inventory: p.inventory_count ?? 0,
  }));

  const campaignSummary = (campaigns ?? []).map(c => ({
    name: c.name,
    objective: c.objective,
    daily_budget: c.budget_daily,
    status: c.status,
  }));

  const system = `You are an expert e-commerce ad creative strategist. Analyze the store data and generate a high-converting creative brief. Return JSON only.`;

  const userMsg = `Store data:
Top products (by price):
${JSON.stringify(productList, null, 2)}

Recent campaigns:
${JSON.stringify(campaignSummary, null, 2)}

Generate a complete creative brief with this exact JSON structure:
{
  "hooks": ["hook1", "hook2", "hook3"],
  "angles": ["angle1", "angle2", "angle3"],
  "copy_variations": ["copy1", "copy2", "copy3", "copy4", "copy5"],
  "format_recommendation": "string describing best ad format (video/static/carousel/etc)",
  "target_audience": "string describing ideal customer profile",
  "brief_summary": "string — 2-3 sentence strategic overview"
}

Base hooks on the product price points and inventory. Reference campaign objectives if available.
Return ONLY valid JSON.`;

  const raw = await callGroq(system, userMsg, 2000);

  let brief: Record<string, unknown>;
  try {
    brief = JSON.parse(raw);
  } catch {
    throw new Error('Failed to parse creative brief from AI');
  }

  // Save to creative_briefs table
  const { data: saved, error } = await supabase
    .from('creative_briefs')
    .insert({
      user_id:    userId,
      brief,
      products_snapshot: productList,
      campaigns_snapshot: campaignSummary,
    })
    .select('id, created_at')
    .single();

  if (error) {
    // Table may not exist yet — still return the brief without crashing
    console.error('creative_briefs insert error:', error.message);
  }

  return {
    brief,
    brief_id: saved?.id ?? null,
    created_at: saved?.created_at ?? new Date().toISOString(),
    products_used: productList.length,
    campaigns_used: campaignSummary.length,
  };
}

async function handleHistory(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('creative_briefs')
    .select('id, brief, created_at, products_snapshot, campaigns_snapshot')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('creative_briefs fetch error:', error.message);
    return { briefs: [] };
  }

  return { briefs: data ?? [] };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'generate');

  try {
    switch (action) {
      case 'generate': {
        if (!GROQ_KEY) return errResponse('AI not configured — set GROQ_API_KEY', 503, origin);
        return okResponse(await handleGenerate(userId), origin);
      }

      case 'history': {
        return okResponse(await handleHistory(userId), origin);
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    console.error('creative-brief error:', err);
    return errResponse(err instanceof Error ? err.message : 'Creative brief error', 500, origin);
  }
});
