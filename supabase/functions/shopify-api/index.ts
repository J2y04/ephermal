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
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';

const SHOPIFY_API_VERSION = '2025-07';

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
    const params: Record<string, string> = {
      limit: '250',
      fields: 'id,title,handle,vendor,product_type,status,images,variants,created_at,updated_at',
    };
    if (pageInfo) params.page_info = pageInfo;

    const url = new URL(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    });
    if (!res.ok) break;

    const data = await res.json() as { products: Record<string, unknown>[] };
    const page = data.products ?? [];
    all.push(...page);

    // Parse Link header for cursor-based next page
    const linkHeader = res.headers.get('link') ?? '';
    const nextMatch  = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) {
      pageInfo = decodeURIComponent(nextMatch[1]);
      hasMore  = true;
    } else {
      hasMore = false;
    }
  }

  return all;
}

/**
 * Shopify's own "Cost per item" field lives on the InventoryItem resource, not on the
 * product/variant object — fetched separately, in batches of up to 250 ids. Requires the
 * read_inventory scope; if the merchant's stored token predates that scope being requested,
 * this 403s and we just skip auto-fill for this sync rather than failing the whole thing.
 */
interface InventoryCostResult {
  costByItemId: Map<string, string>;
  /** True if every batch request came back 401/403 — i.e. the stored token predates the
   *  read_inventory scope. Distinct from "Shopify has no cost data" so the caller can tell
   *  the user the real reason instead of silently reporting 0 filled either way. */
  scopeDenied: boolean;
}

async function fetchInventoryCosts(
  shop: string,
  token: string,
  inventoryItemIds: string[],
): Promise<InventoryCostResult> {
  const costByItemId = new Map<string, string>();
  let sawScopeDenial = false;
  let sawSuccess = false;
  for (let i = 0; i < inventoryItemIds.length; i += 250) {
    const batch = inventoryItemIds.slice(i, i + 250);
    const url = new URL(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/inventory_items.json`);
    url.searchParams.set('ids', batch.join(','));
    url.searchParams.set('limit', '250');
    const res = await fetch(url.toString(), {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) sawScopeDenial = true;
      continue; // missing scope or transient error — degrade gracefully, don't fail the sync
    }
    sawSuccess = true;
    const data = await res.json().catch(() => ({})) as { inventory_items?: { id: number; cost?: string | null }[] };
    for (const item of data.inventory_items ?? []) {
      if (item.cost) costByItemId.set(String(item.id), item.cost);
    }
  }
  // Only report scope-denied if EVERY batch failed with 401/403 and none succeeded —
  // a partial failure shouldn't blame the scope for what's really a transient blip.
  return { costByItemId, scopeDenied: sawScopeDenial && !sawSuccess };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'shopify', [
    { max: 20, window: 60   },
    { max: 120, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

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

        // Shop's own currency — product prices are always in this currency, never
        // Ephermal's internal EUR ad-spend currency. Non-fatal: falls back to USD
        // symbol on the frontend if this call fails.
        let shopCurrency = 'USD';
        try {
          const shopData = await shopifyGet<{ shop?: { currency?: string } }>(shop, token, 'shop.json');
          shopCurrency = shopData.shop?.currency || 'USD';
        } catch { /* non-fatal */ }
        let cogsAutoFilled = 0;
        let cogsScopeDenied = false;
        let cogsAvailableInShopify = 0;

        if (products.length > 0) {
          const rows = products.map(p => {
            const variants = (p.variants as { price?: string; inventory_quantity?: number }[]) ?? [];
            const firstVariant = variants[0];
            const priceCents   = firstVariant?.price
              ? Math.round(parseFloat(firstVariant.price) * 100)
              : 0;
            const inventoryCount = variants.reduce(
              (sum, v) => sum + (v.inventory_quantity ?? 0), 0,
            );
            return {
              shopify_id:      String(p.id),
              user_id:         userId,
              shop,
              title:           String(p.title ?? ''),
              handle:          String(p.handle ?? ''),
              vendor:          String(p.vendor ?? ''),
              product_type:    String(p.product_type ?? ''),
              status:          String(p.status ?? 'active'),
              image_url:       ((p.images as { src?: string }[])?.[0]?.src) ?? null,
              variants:        p.variants ?? [],
              meta_data:       p,
              price_cents:     priceCents,
              inventory_count: inventoryCount,
              synced_at:       new Date().toISOString(),
            };
          });

          const { error: upsertError } = await supabase.from('shopify_products').upsert(rows, { onConflict: 'shopify_id,user_id' });
          if (upsertError) throw new Error(`Failed to save synced products: ${upsertError.message}`);

          // Auto-fill COGS from Shopify's own "Cost per item" field (InventoryItem.cost),
          // where the merchant has already entered it there. Only fills products that
          // don't already have a cogs_cents value in Ephermal — a manual entry/override
          // here always wins over Shopify's value on every future sync.
          const inventoryItemIds = products
            .map(p => (p.variants as { inventory_item_id?: number }[])?.[0]?.inventory_item_id)
            .filter((id): id is number => typeof id === 'number')
            .map(String);

          if (inventoryItemIds.length > 0) {
            const { costByItemId, scopeDenied } = await fetchInventoryCosts(shop, token, inventoryItemIds);
            cogsScopeDenied = scopeDenied;
            cogsAvailableInShopify = costByItemId.size;
            const fillResults = await Promise.all(products.map(async (p) => {
              const variant = (p.variants as { inventory_item_id?: number }[])?.[0];
              const cost = variant?.inventory_item_id != null ? costByItemId.get(String(variant.inventory_item_id)) : undefined;
              if (!cost) return false;
              const cogsCents = Math.round(parseFloat(cost) * 100);
              if (!Number.isFinite(cogsCents)) return false;
              const { data, error } = await supabase.from('shopify_products')
                .update({ cogs_cents: cogsCents })
                .eq('shopify_id', String(p.id))
                .eq('user_id', userId)
                .is('cogs_cents', null)
                .select('id');
              if (error) console.error('[shopify-api] cogs auto-fill update failed:', error.message);
              return !!data && data.length > 0;
            }));
            cogsAutoFilled = fillResults.filter(Boolean).length;
          }
        }

        // Update last sync time on user_integrations
        await supabase.from('user_integrations')
          .update({ shopify_synced_at: new Date().toISOString() })
          .eq('user_id', userId);

        return okResponse({
          synced: products.length,
          shop,
          shop_currency: shopCurrency,
          message: `Synced ${products.length} products from ${shop}`,
          products,
          cogs_auto_filled: cogsAutoFilled,
          cogs_scope_denied: cogsScopeDenied,
          cogs_available_in_shopify: cogsAvailableInShopify,
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
