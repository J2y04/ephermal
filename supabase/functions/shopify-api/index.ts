/**
 * Ephermal — Shopify API Edge Function
 *
 * Proxies Shopify Admin REST API calls server-side using the stored
 * access token from user_integrations. Never exposes the token to
 * the browser.
 *
 * GET  ?action=products[&limit=50&page_info=xxx]  — paginated product list
 * GET  ?action=shop                               — shop details
 * GET  ?action=orders[&limit=50&status=any]       — recent orders
 * POST { action: 'sync_products' }               — fetch all products + upsert to DB
 *
 * Required env vars:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';

const SHOPIFY_API_VERSION = '2024-01';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface ShopifyCredentials {
  token: string;
  shop:  string;
}

/** Load stored Shopify token + shop domain for the user */
async function getCredentials(userId: string): Promise<ShopifyCredentials | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('shopify_token, shopify_shop')
    .eq('user_id', userId)
    .single();

  if (!data?.shopify_token || !data?.shopify_shop) return null;
  return { token: data.shopify_token as string, shop: data.shopify_shop as string };
}

/** Generic Shopify Admin REST call */
async function shopifyGet<T>(
  shop: string,
  token: string,
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { errors?: string }).errors ?? `Shopify error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch all products (handles pagination) */
async function fetchAllProducts(
  shop: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let pageInfo: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string> = { limit: '250', fields: 'id,title,handle,vendor,product_type,status,images,variants,created_at,updated_at' };
    if (pageInfo) params.page_info = pageInfo;

    const res = await shopifyGet<{ products: Record<string, unknown>[] }>(
      shop, token, 'products.json', params,
    );
    all.push(...(res.products ?? []));

    // Check link header for next page (Shopify cursor-based pagination)
    hasMore = false;
    pageInfo = null;
  }

  return all;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const userId = extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const creds = await getCredentials(userId);
  if (!creds) return errResponse('Shopify not connected. Connect your store in Settings.', 403, origin);

  const { token, shop } = creds;
  const url    = new URL(req.url);
  const action = req.method === 'GET'
    ? (url.searchParams.get('action') ?? 'products')
    : String((await req.json().catch(() => ({}))).action ?? '');

  try {
    switch (action) {
      case 'products': {
        const limit    = url.searchParams.get('limit') ?? '50';
        const pageInfo = url.searchParams.get('page_info') ?? '';
        const params: Record<string, string> = {
          limit,
          fields: 'id,title,handle,vendor,product_type,status,images,variants,created_at,updated_at',
        };
        if (pageInfo) params.page_info = pageInfo;
        const data = await shopifyGet<{ products: unknown[] }>(shop, token, 'products.json', params);
        return okResponse(data, origin);
      }

      case 'shop': {
        const data = await shopifyGet<{ shop: unknown }>(shop, token, 'shop.json');
        return okResponse(data, origin);
      }

      case 'orders': {
        const limit  = url.searchParams.get('limit') ?? '50';
        const status = url.searchParams.get('status') ?? 'any';
        const data   = await shopifyGet<{ orders: unknown[] }>(
          shop, token, 'orders.json', { limit, status, fields: 'id,name,email,total_price,financial_status,created_at,line_items' },
        );
        return okResponse(data, origin);
      }

      case 'sync_products': {
        // Fetch all products and upsert to shopify_products table
        const products = await fetchAllProducts(shop, token);

        if (products.length > 0) {
          const rows = products.map(p => ({
            shopify_id:   String(p.id),
            user_id:      userId,
            shop,
            title:        String(p.title ?? ''),
            handle:       String(p.handle ?? ''),
            vendor:       String(p.vendor ?? ''),
            product_type: String(p.product_type ?? ''),
            status:       String(p.status ?? 'active'),
            image_url:    ((p.images as { src?: string }[])?.[0]?.src) ?? null,
            variants:     p.variants ?? [],
            meta_data:    p,
            synced_at:    new Date().toISOString(),
          }));

          await supabase.from('shopify_products').upsert(rows, { onConflict: 'shopify_id,user_id' });
        }

        // Update last sync time on user_integrations
        await supabase.from('user_integrations')
          .update({ shopify_synced_at: new Date().toISOString() })
          .eq('user_id', userId);

        return okResponse({
          synced: products.length,
          shop,
          message: `Synced ${products.length} products from ${shop}`,
        }, origin);
      }

      case 'collections': {
        const data = await shopifyGet<{ custom_collections: unknown[] }>(
          shop, token, 'custom_collections.json', { limit: '100' },
        );
        return okResponse(data, origin);
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    console.error('shopify-api error:', err);
    const msg = err instanceof Error ? err.message : 'Shopify API error';
    return errResponse(msg, 500, origin);
  }
});
