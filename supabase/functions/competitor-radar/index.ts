/**
 * Ephermal — Competitor Radar (Supabase Edge Function)
 *
 * Searches Meta Ad Library for competitor ads and analyses them with Groq.
 *
 * POST { action: 'search', search_terms: string, countries?: string[] }
 *   — fetches user's meta_access_token from user_integrations, queries Meta Ad Library API,
 *     returns matching ads. Returns { error, code: 'NO_META_TOKEN' } if not connected.
 *
 * POST { action: 'analyze', ad_text: string }
 *   — uses Groq llama-3.3-70b-versatile to analyse a competitor ad's copy.
 *     Returns { hook_type, emotion, cta, strengths, counter_strategy }.
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

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';
const META_AD_FIELDS = 'id,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,page_name,spend,impressions';

async function callGroq(system: string, user: string, maxTokens = 1500): Promise<string> {
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

async function getMetaToken(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('meta_access_token')
    .eq('user_id', userId)
    .single();
  return data?.meta_access_token ?? null;
}

async function handleSearch(
  userId: string,
  searchTerms: string,
  countries: string[],
): Promise<Record<string, unknown>> {
  const token = await getMetaToken(userId);
  if (!token) {
    return {
      error: 'Connect Meta Ads first to use Competitor Radar',
      code: 'NO_META_TOKEN',
    };
  }

  const reachedCountries = countries.length > 0 ? countries.join(',') : 'US';
  const params = new URLSearchParams({
    search_terms:         searchTerms,
    ad_type:              'ALL',
    ad_reached_countries: reachedCountries,
    fields:               META_AD_FIELDS,
    limit:                '20',
    access_token:         token,
  });

  const url = `${META_GRAPH_URL}/ads_archive?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const metaErr = (err?.error as Record<string, unknown>)?.message ?? `Meta API error ${res.status}`;
    throw new Error(String(metaErr));
  }

  const data = await res.json() as { data?: unknown[]; paging?: unknown };
  return {
    ads:    data.data ?? [],
    paging: data.paging ?? null,
    search_terms: searchTerms,
    countries: reachedCountries.split(','),
  };
}

async function handleAnalyze(adText: string): Promise<Record<string, unknown>> {
  const system = `You are an expert ad copywriter and marketing strategist. Analyze the competitor ad copy provided and return structured insights. Return JSON only.`;

  const userMsg = `Analyze this competitor ad copy:

"${adText}"

Return a JSON object with this exact structure:
{
  "hook_type": "string — e.g. problem-agitate, curiosity, social proof, transformation, fear, scarcity",
  "emotion": "string — primary emotion targeted (e.g. fear of missing out, aspiration, frustration, desire)",
  "cta": "string — call to action used or implied",
  "strengths": ["strength1", "strength2", "strength3"],
  "counter_strategy": "string — how to position against this ad to win the same audience"
}

Return ONLY valid JSON.`;

  const raw = await callGroq(system, userMsg, 800);

  let analysis: Record<string, unknown>;
  try {
    analysis = JSON.parse(raw);
  } catch {
    throw new Error('Failed to parse ad analysis from AI');
  }

  return analysis;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'search');

  try {
    switch (action) {
      case 'search': {
        const searchTerms = String(body.search_terms ?? '').trim();
        if (!searchTerms) return errResponse('search_terms is required', 400, origin);
        const countries = Array.isArray(body.countries)
          ? (body.countries as unknown[]).map(String).filter(Boolean)
          : [];
        const result = await handleSearch(userId, searchTerms, countries);
        // If no meta token, still return 200 with error payload (client handles it)
        return okResponse(result, origin);
      }

      case 'analyze': {
        if (!GROQ_KEY) return errResponse('AI not configured — set GROQ_API_KEY', 503, origin);
        const adText = String(body.ad_text ?? '').trim();
        if (!adText) return errResponse('ad_text is required', 400, origin);
        return okResponse(await handleAnalyze(adText), origin);
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    console.error('competitor-radar error:', err);
    return errResponse(err instanceof Error ? err.message : 'Competitor radar error', 500, origin);
  }
});
