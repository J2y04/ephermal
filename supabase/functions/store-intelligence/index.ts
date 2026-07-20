/**
 * Ephermal — Store Intelligence (Supabase Edge Function)
 *
 * Reads the user's connected Shopify store (products, shop info, storefront
 * homepage) and generates a permanent brand-context brief with Claude Sonnet:
 * summary, target audience, ad opportunities, brand vibe, color palette,
 * typography direction, and UGC creative direction. Stored in
 * store_intelligence and reused by ad copy, UGC scripts, and Higgsfield prompts.
 *
 * POST { action: 'analyze' }  — regenerate the brief from live Shopify data
 * POST { action: 'get' }      — return the last generated brief
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';

const SHOPIFY_API_VERSION = '2025-07';
const ANTHROPIC_KEY   = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-5';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface ShopifyCredentials {
  token: string;
  shop:  string;
}

async function getShopifyCredentials(userId: string): Promise<ShopifyCredentials | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('shopify_token, shopify_shop')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.shopify_token || !data?.shopify_shop) return null;
  return { token: data.shopify_token as string, shop: data.shopify_shop as string };
}

async function fetchShopInfo(shop: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return {};
  const data = await res.json() as { shop?: Record<string, unknown> };
  return data.shop ?? {};
}

/** Best-effort logo/theme-color extraction from the public storefront homepage. No auth needed. */
async function fetchStorefrontSignals(shop: string): Promise<{ logo_url: string | null; theme_color: string | null }> {
  try {
    const res = await fetch(`https://${shop}/`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { logo_url: null, theme_color: null };
    const html = await res.text();
    const ogImage    = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
                     ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
    const themeColor = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)?.[1]
                     ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i)?.[1];
    return { logo_url: ogImage ?? null, theme_color: themeColor ?? null };
  } catch {
    return { logo_url: null, theme_color: null };
  }
}

const HEX_RE = /^#[0-9A-Fa-f]{3,8}$/;

/**
 * Real brand colors + logo from the active theme's settings_data.json — far more
 * reliable than scraping for a theme-color meta tag most themes never set.
 * Requires the read_themes scope; falls back silently (caller uses homepage
 * scrape instead) for tokens granted before this scope was added.
 */
async function fetchThemeSignals(shop: string, token: string): Promise<{ colors: string[]; logo_url: string | null }> {
  try {
    const themesRes = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/themes.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    if (!themesRes.ok) return { colors: [], logo_url: null };
    const themesData = await themesRes.json() as { themes?: { id: number; role: string }[] };
    const mainTheme = themesData.themes?.find(t => t.role === 'main') ?? themesData.themes?.[0];
    if (!mainTheme) return { colors: [], logo_url: null };

    const assetRes = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/themes/${mainTheme.id}/assets.json?asset[key]=config/settings_data.json`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    if (!assetRes.ok) return { colors: [], logo_url: null };
    const assetData = await assetRes.json() as { asset?: { value?: string } };
    if (!assetData.asset?.value) return { colors: [], logo_url: null };

    const settings = JSON.parse(assetData.asset.value) as Record<string, unknown>;
    const colors = new Set<string>();
    let logoUrl: string | null = null;

    // Theme settings schemas vary per theme — walk the tree heuristically:
    // any hex-looking string is a color signal, any URL under a "logo"-ish key is the logo.
    function walk(node: unknown, keyHint = ''): void {
      if (colors.size >= 8 && logoUrl) return;
      if (typeof node === 'string') {
        if (HEX_RE.test(node)) colors.add(node);
        else if (!logoUrl && /logo/i.test(keyHint) && /^(https?:)?\/\//.test(node)) {
          logoUrl = node.startsWith('//') ? `https:${node}` : node;
        }
        return;
      }
      if (Array.isArray(node)) { node.forEach(v => walk(v, keyHint)); return; }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, k);
      }
    }
    walk((settings as { current?: unknown }).current ?? settings);

    return { colors: [...colors].slice(0, 8), logo_url: logoUrl };
  } catch {
    return { colors: [], logo_url: null };
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

async function handleAnalyze(userId: string): Promise<Record<string, unknown>> {
  const creds = await getShopifyCredentials(userId);
  if (!creds) throw new Error('Shopify not connected. Connect your store in Settings first.');
  const { token, shop } = creds;

  const { data: products } = await supabase
    .from('shopify_products')
    .select('title, vendor, product_type, price_cents, inventory_count, image_url')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('price_cents', { ascending: false })
    .limit(15);

  if (!products || products.length === 0) {
    throw new Error('No synced products found. Visit Store Products to sync your catalog first.');
  }

  const [shopInfo, storefront, theme] = await Promise.all([
    fetchShopInfo(shop, token),
    fetchStorefrontSignals(shop),
    fetchThemeSignals(shop, token),
  ]);
  const logoUrl = theme.logo_url ?? storefront.logo_url;

  const system = `You are an expert Shopify brand strategist and Meta/Google Ads strategist. You analyze REAL store data (never invent facts not present in the input) and produce a precise, structured brand intelligence brief. Return ONLY valid JSON, no markdown, matching this exact schema:
{
  "summary": string (2-3 sentences on what this store sells and who it serves),
  "target_audience": string (specific ideal customer profile),
  "ad_opportunities": string (top advertising angles for this specific catalog),
  "meta_strategy": string (recommended Meta Ads approach for this store),
  "products": string[] (3-6 key product categories, derived from the actual catalog),
  "keywords": string[] (5-10 SEO/ad keywords specific to this store and niche),
  "brand_vibe": string (2-4 words, e.g. "Minimal Scandinavian" or "Bold streetwear"),
  "color_palette": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text_on_bg": "#hex" },
  "typography": { "heading_style": string, "body_style": string },
  "ugc_visual": string (visual style guidance for UGC video/photo generation),
  "ugc_tone": string (tone and energy guidance for UGC scripts)
}
Base the color palette on the theme's actual detected colors if present (pick the most brand-relevant ones for primary/secondary/accent, and choose sensible background/text values that pair with them). Do not use the homepage meta tag fallback if the theme's real colors are available. Only infer tasteful hex values from scratch if neither signal is present. Every field must be grounded in the input data. Do not hallucinate specifics about the business beyond what the catalog and shop info imply.
Writing style: write like a real strategist, not an AI. Never use em dashes (—) or arrow characters (→). Use periods, commas, or "and" to join clauses instead.`;

  const userMsg = `Shop name: ${shopInfo.name ?? shop}
Domain: ${shop}
Shop description: ${shopInfo.description ?? 'none provided'}
Colors found in the active theme's settings (most reliable signal): ${theme.colors.length ? theme.colors.join(', ') : 'none detected'}
Homepage theme-color meta tag (fallback signal): ${storefront.theme_color ?? 'none detected'}

Top products (by price):
${JSON.stringify(products, null, 2)}`;

  const raw = await callClaude(system, userMsg);
  let brief: Record<string, unknown>;
  try {
    const json = raw.replace(/```json\s*|```/g, '').trim();
    brief = JSON.parse(json);
  } catch {
    throw new Error('Failed to parse store intelligence brief from AI');
  }

  const row = {
    user_id:          userId,
    shop,
    summary:          brief.summary ?? null,
    target_audience:  brief.target_audience ?? null,
    ad_opportunities: brief.ad_opportunities ?? null,
    meta_strategy:    brief.meta_strategy ?? null,
    products:         brief.products ?? [],
    keywords:         brief.keywords ?? [],
    brand_vibe:       brief.brand_vibe ?? null,
    color_palette:    brief.color_palette ?? {},
    typography:       brief.typography ?? {},
    ugc_visual:       brief.ugc_visual ?? null,
    ugc_tone:         brief.ugc_tone ?? null,
    logo_url:         logoUrl,
    model_version:    ANTHROPIC_MODEL,
    generated_at:     new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  };

  await supabase.from('store_intelligence').upsert(row, { onConflict: 'user_id' });

  return row;
}

async function handleGet(userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('store_intelligence')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return { brief: data ?? null };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'store-intelligence', [
    { max: 3,  window: 60   },
    { max: 15, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'get');

  try {
    switch (action) {
      case 'analyze': {
        if (!ANTHROPIC_KEY) return errResponse('AI not configured. Set ANTHROPIC_API_KEY', 503, origin);
        return okResponse(await handleAnalyze(userId), origin);
      }
      case 'get':
        return okResponse(await handleGet(userId), origin);
      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    console.error('store-intelligence error:', err);
    return errResponse('Store intelligence error', 500, origin);
  }
});
