/**
 * Ephermal — Public Store Scan (Supabase Edge Function)
 *
 * The free, no-login "Analyse Your Store" tool on the marketing landing page.
 * Takes any storefront URL, pulls its public product catalog (Shopify's
 * unauthenticated /products.json endpoint — no OAuth needed) and homepage
 * signals, and generates the same brand-intelligence brief as the
 * authenticated store-intelligence function, via Claude Sonnet.
 *
 * POST { url: string }
 *
 * No auth required. Rate-limited by IP. Results cached by domain for 24h so
 * repeat visits/shares don't re-trigger a Claude call.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimitIp, rateLimitResponse } from '../_shared/rate-limit.ts';

const ANTHROPIC_KEY   = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-5';
const CACHE_HOURS     = 24;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function corsHeaders(origin: string | null): Record<string, string> {
  const appUrl = Deno.env.get('APP_URL') ?? 'https://ephermal.app';
  const allowed = [appUrl, 'https://dashboard.ephermal.app'];
  return {
    'Access-Control-Allow-Origin':  origin && allowed.includes(origin) ? origin : appUrl,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

function errResponse(message: string, status: number, origin: string | null): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function okResponse(data: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

/** Normalize arbitrary user input into a bare hostname (no protocol/path/query). */
function normalizeDomain(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('.') || host.length > 253) return null;
    return host;
  } catch {
    return null;
  }
}

async function fetchStorefrontSignals(domain: string): Promise<{ logo_url: string | null; theme_color: string | null; title: string | null; description: string | null }> {
  try {
    const res = await fetch(`https://${domain}/`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { logo_url: null, theme_color: null, title: null, description: null };
    const html = await res.text();
    const pick = (re: RegExp) => html.match(re)?.[1] ?? null;
    const ogImage    = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                     ?? pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const themeColor = pick(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)
                     ?? pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
    const title = pick(/<title>([^<]+)<\/title>/i);
    const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                      ?? pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    return { logo_url: ogImage, theme_color: themeColor, title, description };
  } catch {
    return { logo_url: null, theme_color: null, title: null, description: null };
  }
}

interface PublicProduct { title: string; vendor?: string; product_type?: string; price?: string }

/** Shopify's default storefront exposes /products.json publicly — no OAuth needed. */
async function fetchPublicProducts(domain: string): Promise<PublicProduct[]> {
  try {
    const res = await fetch(`https://${domain}/products.json?limit=20`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json() as { products?: { title: string; vendor?: string; product_type?: string; variants?: { price?: string }[] }[] };
    return (data.products ?? []).map(p => ({
      title:        p.title,
      vendor:       p.vendor,
      product_type: p.product_type,
      price:        p.variants?.[0]?.price,
    })).filter(p => p.title);
  } catch {
    return [];
  }
}

async function callClaude(system: string, user: string): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      ANTHROPIC_MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json() as { content: { type: string; text?: string }[] };
  return data.content?.find(c => c.type === 'text')?.text ?? '';
}

async function analyzeDomain(domain: string): Promise<Record<string, unknown>> {
  const [signals, products] = await Promise.all([
    fetchStorefrontSignals(domain),
    fetchPublicProducts(domain),
  ]);

  if (products.length === 0 && !signals.title) {
    throw new Error('Could not read this store — check the URL and make sure the site is publicly reachable.');
  }

  const system = `You are an expert Shopify brand strategist and Meta/Google Ads strategist analyzing a PUBLIC storefront for a free preview tool. Work only from the data given — never invent specifics about the business beyond what's provided. Return ONLY valid JSON, no markdown, matching this exact schema:
{
  "summary": string (2-3 sentences on what this store sells and who it serves),
  "target_audience": string (specific ideal customer profile),
  "ad_opportunities": string (top advertising angles for this specific catalog),
  "meta_strategy": string (recommended Meta Ads approach for this store),
  "products": string[] (3-6 key product categories, derived from the actual catalog if available),
  "keywords": string[] (5-10 SEO/ad keywords specific to this store and niche),
  "brand_vibe": string (2-4 words, e.g. "Minimal Scandinavian" or "Bold streetwear"),
  "color_palette": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text_on_bg": "#hex" },
  "typography": { "heading_style": string, "body_style": string },
  "ugc_visual": string (visual style guidance for UGC video/photo generation),
  "ugc_tone": string (tone and energy guidance for UGC scripts)
}
Base the color palette on the detected theme color if present, otherwise infer tasteful hex values consistent with the brand vibe. If no product catalog was available, base the analysis on the homepage title/description alone and say so implicitly by keeping claims general.`;

  const userMsg = `Store domain: ${domain}
Homepage title: ${signals.title ?? 'unknown'}
Homepage description: ${signals.description ?? 'unknown'}
Detected theme color: ${signals.theme_color ?? 'none detected'}
Product catalog (public, up to 20 items): ${products.length ? JSON.stringify(products, null, 2) : 'not available — this store does not expose a public catalog or is not a standard Shopify storefront'}`;

  const raw = await callClaude(system, userMsg);
  let brief: Record<string, unknown>;
  try {
    brief = JSON.parse(raw.replace(/```json\s*|```/g, '').trim());
  } catch {
    throw new Error('Failed to parse store analysis from AI');
  }

  return {
    domain,
    ...brief,
    logo_url:   signals.logo_url,
    has_catalog: products.length > 0,
    scanned_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const rl = await rateLimitIp(req, 'public-store-scan', 5, 3600);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const domain = normalizeDomain(String(body.url ?? ''));
  if (!domain) return errResponse('Enter a valid store URL', 400, origin);

  try {
    // Serve from cache if scanned recently — protects against cost abuse and repeat hits
    const { data: cached } = await supabase
      .from('public_store_scans')
      .select('result, created_at')
      .eq('domain', domain)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.created_at as string).getTime() < CACHE_HOURS * 3_600_000) {
      return okResponse({ ...(cached.result as Record<string, unknown>), cached: true }, origin);
    }

    if (!ANTHROPIC_KEY) return errResponse('AI not configured — set ANTHROPIC_API_KEY', 503, origin);

    const result = await analyzeDomain(domain);
    await supabase.from('public_store_scans').upsert({
      domain,
      result,
      model_version: ANTHROPIC_MODEL,
      created_at: new Date().toISOString(),
    }, { onConflict: 'domain' });

    return okResponse({ ...result, cached: false }, origin);
  } catch (err) {
    console.error('public-store-scan error:', err);
    return errResponse(err instanceof Error ? err.message : 'Store analysis failed', 500, origin);
  }
});
