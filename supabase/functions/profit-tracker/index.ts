/**
 * Ephermal — Profit Tracker (Supabase Edge Function)
 *
 * Manages Cost of Goods Sold (COGS) per product and calculates profit margins.
 *
 * POST { action: 'set_cogs',  product_id: string, cogs_cents: number }
 *   — UPDATE shopify_products SET cogs_cents = N WHERE product_id = X AND user_id = Y
 *
 * POST { action: 'bulk_set', items: [{ product_id, cogs_cents }] }
 *   — bulk update COGS for multiple products
 *
 * POST { action: 'get_report' }
 *   — returns all products with margin calculations, sorted by margin_percent desc.
 *     Summary includes avg_margin, total_products_with_cogs, estimated_profit_per_roas_point.
 *
 * Required env vars:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';
import { requirePlan } from '../_shared/plan.ts';
import { computeProductMargin, computeCatalogMargin } from '../_shared/margin.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function handleSetCogs(
  userId: string,
  productId: string,
  cogsCents: number,
): Promise<Record<string, unknown>> {
  const { error } = await supabase
    .from('shopify_products')
    .update({ cogs_cents: cogsCents })
    .eq('product_id', productId)
    .eq('user_id', userId);

  if (error) {
    // Postgres error code 42703 = undefined_column, the actual "migration hasn't run yet"
    // signature. Substring-matching error.message for 'column' or 'cogs_cents' was broad enough
    // to also catch an RLS violation or a check-constraint/type-mismatch error on this same
    // column (both plausibly mention 'cogs_cents' or the word 'column' in their real message),
    // misclassifying a genuine error as "run the migration" and sending the user down the
    // wrong troubleshooting path.
    if (error.code === '42703') {
      return { error: 'Run DB migration first', migration_needed: true };
    }
    throw new Error(error.message);
  }

  return { success: true, product_id: productId, cogs_cents: cogsCents };
}

async function handleBulkSet(
  userId: string,
  items: { product_id: string; cogs_cents: number }[],
): Promise<Record<string, unknown>> {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, updated: 0 };
  }

  const results: { product_id: string; success: boolean; error?: string }[] = [];

  // Run updates concurrently — each product must pass the user_id guard
  await Promise.all(
    items.map(async (item) => {
      const productId = String(item.product_id ?? '');
      const cogsCents = Number(item.cogs_cents ?? 0);
      if (!productId) {
        results.push({ product_id: productId, success: false, error: 'missing product_id' });
        return;
      }
      const { error } = await supabase
        .from('shopify_products')
        .update({ cogs_cents: cogsCents })
        .eq('product_id', productId)
        .eq('user_id', userId);
      if (error) {
        results.push({ product_id: productId, success: false, error: error.message });
      } else {
        results.push({ product_id: productId, success: true });
      }
    }),
  );

  const successCount = results.filter(r => r.success).length;
  return { success: true, updated: successCount, total: items.length, results };
}

async function handleGetReport(userId: string): Promise<Record<string, unknown>> {
  const { data: products, error } = await supabase
    .from('shopify_products')
    .select('product_id, title, price_cents, cogs_cents, inventory_count')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  const rows = (products ?? []) as {
    product_id: string;
    title: string;
    price_cents: number;
    cogs_cents: number | null;
    inventory_count: number | null;
  }[];

  const enriched = rows.map(p => {
    const { hasCogs, profitPerUnitCents, marginPercent } = computeProductMargin(p);

    return {
      product_id:           p.product_id,
      title:                p.title,
      price_cents:          p.price_cents ?? 0,
      cogs_cents:           p.cogs_cents ?? null,
      profit_per_unit_cents: profitPerUnitCents,
      margin_percent:       marginPercent,
      inventory_count:      p.inventory_count ?? 0,
      has_cogs:             hasCogs,
    };
  });

  // Sort by margin_percent desc (null values at end)
  enriched.sort((a, b) => {
    if (a.margin_percent === null && b.margin_percent === null) return 0;
    if (a.margin_percent === null) return 1;
    if (b.margin_percent === null) return -1;
    return b.margin_percent - a.margin_percent;
  });

  const { avgMarginPercent, productsWithCogs, totalProducts } = computeCatalogMargin(rows);

  // estimated_profit_per_roas_point: if you spend $1 and get ROAS of 1,
  // profit earned = avg margin on revenue. So at ROAS=1 per $1 spend → $1 revenue × avg_margin%
  const estimatedProfitPerRoasPoint = avgMarginPercent !== null
    ? Math.round(avgMarginPercent * 100) / 10000  // as a decimal (e.g. 0.35 for 35%)
    : null;

  return {
    products: enriched,
    summary: {
      total_products:           totalProducts,
      total_products_with_cogs: productsWithCogs,
      avg_margin_percent:       avgMarginPercent,
      estimated_profit_per_roas_point: estimatedProfitPerRoasPoint,
    },
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const gate = await requirePlan(userId, 'growth', origin, 'the profit tracker');
  if (gate) return gate;

  const rl = await rateLimitTiered(userId, 'profit', [
    { max: 10, window: 60   },
    { max: 60, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'get_report');

  try {
    switch (action) {
      case 'set_cogs': {
        const productId = String(body.product_id ?? '').trim();
        if (!productId) return errResponse('product_id is required', 400, origin);
        const cogsCents = Number(body.cogs_cents ?? 0);
        if (isNaN(cogsCents) || cogsCents < 0) return errResponse('cogs_cents must be a non-negative number', 400, origin);
        return okResponse(await handleSetCogs(userId, productId, cogsCents), origin);
      }

      case 'bulk_set': {
        const items = body.items;
        if (!Array.isArray(items)) return errResponse('items must be an array', 400, origin);
        if (items.length > 500) return errResponse('bulk_set limited to 500 items per request', 400, origin);
        const typed = (items as unknown[]).map(i => {
          const row = i as Record<string, unknown>;
          return { product_id: String(row.product_id ?? ''), cogs_cents: Number(row.cogs_cents ?? 0) };
        });
        return okResponse(await handleBulkSet(userId, typed), origin);
      }

      case 'get_report': {
        return okResponse(await handleGetReport(userId), origin);
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    console.error('profit-tracker error:', err);
    return errResponse('Profit tracker error', 500, origin);
  }
});
