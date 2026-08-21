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
import {
  computeProductMargin,
  computeCatalogMargin,
  toVariableCosts,
  type VariableCosts,
} from '../_shared/margin.ts';

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
      if (isNaN(cogsCents) || cogsCents < 0) {
        results.push({ product_id: productId, success: false, error: 'cogs_cents must be a non-negative number' });
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

/** The merchant's variable-cost settings. A missing row means "not configured",
 *  which reads as all-zero fees and keeps contribution identical to gross rather
 *  than inventing a fee load nobody entered. */
async function loadVariableCosts(userId: string): Promise<VariableCosts> {
  const { data } = await supabase
    .from('user_integrations')
    .select('fee_payment_pct, fee_payment_fixed_cents, fee_shipping_cents, fee_other_pct')
    .eq('user_id', userId)
    .maybeSingle();
  return toVariableCosts(data as Record<string, unknown> | null);
}

async function handleSetFees(
  userId: string,
  fees: VariableCosts,
): Promise<Record<string, unknown>> {
  const { error } = await supabase
    .from('user_integrations')
    .update({
      fee_payment_pct:         fees.paymentPct,
      fee_payment_fixed_cents: fees.paymentFixedCents,
      fee_shipping_cents:      fees.shippingCents,
      fee_other_pct:           fees.otherPct,
    })
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return { success: true, fees };
}

async function handleGetReport(userId: string): Promise<Record<string, unknown>> {
  const [{ data: products, error }, fees] = await Promise.all([
    supabase
      .from('shopify_products')
      .select('product_id, title, price_cents, cogs_cents, inventory_count')
      .eq('user_id', userId),
    loadVariableCosts(userId),
  ]);

  if (error) throw new Error(error.message);

  const rows = (products ?? []) as {
    product_id: string;
    title: string;
    price_cents: number;
    cogs_cents: number | null;
    inventory_count: number | null;
  }[];

  const enriched = rows.map(p => {
    const m = computeProductMargin(p, fees);

    return {
      product_id:           p.product_id,
      title:                p.title,
      price_cents:          p.price_cents ?? 0,
      cogs_cents:           p.cogs_cents ?? null,
      profit_per_unit_cents: m.profitPerUnitCents,
      margin_percent:       m.marginPercent,
      inventory_count:      p.inventory_count ?? 0,
      has_cogs:             m.hasCogs,
      // Contribution equals gross until the merchant enters fees; has_variable_costs
      // tells the UI which of the two it is actually looking at, so it can never
      // label an unadjusted number "contribution".
      variable_costs_per_unit_cents: m.variableCostsPerUnitCents,
      contribution_per_unit_cents:   m.contributionPerUnitCents,
      contribution_margin_percent:   m.contributionMarginPercent,
      break_even_roas:               m.breakEvenRoas,
    };
  });

  // Sort by margin_percent desc (null values at end)
  enriched.sort((a, b) => {
    if (a.margin_percent === null && b.margin_percent === null) return 0;
    if (a.margin_percent === null) return 1;
    if (b.margin_percent === null) return -1;
    return b.margin_percent - a.margin_percent;
  });

  const catalog = computeCatalogMargin(rows, fees);
  const { avgMarginPercent, productsWithCogs, totalProducts } = catalog;

  // estimated_profit_per_roas_point: if you spend $1 and get ROAS of 1,
  // profit earned = avg margin on revenue. So at ROAS=1 per $1 spend → $1 revenue × avg_margin%
  // Profit kept per point of ROAS. Uses CONTRIBUTION margin wherever fees are
  // known, because the gross version overstates what a point of ROAS is worth by
  // exactly the fee load, which is the error the fee settings exist to remove.
  const marginForRoas = catalog.avgContributionMarginPercent ?? avgMarginPercent;
  const estimatedProfitPerRoasPoint = marginForRoas !== null
    ? Math.round(marginForRoas * 100) / 10000  // as a decimal (e.g. 0.35 for 35%)
    : null;

  return {
    products: enriched,
    summary: {
      total_products:           totalProducts,
      total_products_with_cogs: productsWithCogs,
      avg_margin_percent:       avgMarginPercent,
      avg_contribution_margin_percent: catalog.avgContributionMarginPercent,
      products_losing_money:    catalog.productsLosingMoney,
      estimated_profit_per_roas_point: estimatedProfitPerRoasPoint,
      // Whether the figures above account for payment, shipping and handling, or
      // are gross because the merchant has not entered fees yet.
      has_variable_costs:       catalog.hasVariableCosts,
      fees: {
        payment_pct:         fees.paymentPct,
        payment_fixed_cents: fees.paymentFixedCents,
        shipping_cents:      fees.shippingCents,
        other_pct:           fees.otherPct,
      },
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

      case 'set_fees': {
        // Validated here as well as in the CHECK constraints, so a bad value
        // returns a readable 400 instead of a Postgres constraint error string.
        const pct = (v: unknown, label: string): number => {
          const n = Number(v ?? 0);
          if (!Number.isFinite(n) || n < 0 || n > 100) {
            throw new RangeError(`${label} must be a percentage between 0 and 100`);
          }
          return Math.round(n * 1000) / 1000;
        };
        const cents = (v: unknown, label: string, max: number): number => {
          const n = Number(v ?? 0);
          if (!Number.isFinite(n) || n < 0 || n > max) {
            throw new RangeError(`${label} must be between 0 and ${max} cents`);
          }
          return Math.round(n);
        };

        let fees;
        try {
          fees = {
            paymentPct:        pct(body.payment_pct, 'payment_pct'),
            otherPct:          pct(body.other_pct, 'other_pct'),
            paymentFixedCents: cents(body.payment_fixed_cents, 'payment_fixed_cents', 100000),
            shippingCents:     cents(body.shipping_cents, 'shipping_cents', 1000000),
          };
        } catch (e) {
          return errResponse((e as Error).message, 400, origin);
        }

        if (fees.paymentPct + fees.otherPct > 100) {
          return errResponse('payment_pct and other_pct cannot add up to more than 100', 400, origin);
        }

        return okResponse(await handleSetFees(userId, fees), origin);
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
