/**
 * Ephermal — shared catalog margin helper
 *
 * Used by both profit-tracker (per-product margin table) and mrr-tracker
 * (blended margin estimate for the revenue/margin chart) so the two features
 * can never drift on what counts as "has COGS" or how margin% ends up computed.
 */

export interface ProductMarginInput {
  price_cents: number | null;
  cogs_cents: number | null;
}

export interface ProductMarginResult {
  hasCogs: boolean;
  profitPerUnitCents: number | null;
  marginPercent: number | null;
}

export function computeProductMargin(p: ProductMarginInput): ProductMarginResult {
  const price = p.price_cents ?? 0;
  const cogs = p.cogs_cents ?? 0;
  const hasCogs = (p.cogs_cents ?? null) !== null && p.cogs_cents! >= 0;

  const profitPerUnitCents = hasCogs ? price - cogs : null;
  const marginPercent = hasCogs && price > 0
    ? Math.round(((price - cogs) / price) * 10000) / 100
    : null;

  return { hasCogs, profitPerUnitCents, marginPercent };
}

export interface CatalogMarginResult {
  avgMarginPercent: number | null;
  productsWithCogs: number;
  totalProducts: number;
}

/** Simple (unweighted) average of margin% across products that have COGS set.
 *  Not weighted by units sold or revenue - neither caller has per-order/per-SKU
 *  revenue data available, so this is a catalog-level estimate, not a true
 *  blended margin. Callers should label anything derived from this "Estimated". */
export function computeCatalogMargin(products: ProductMarginInput[]): CatalogMarginResult {
  const margins = products.map(computeProductMargin);
  const withCogs = margins.filter(m => m.hasCogs);
  const avgMarginPercent = withCogs.length > 0
    ? Math.round(
        withCogs.reduce((sum, m) => sum + (m.marginPercent ?? 0), 0) / withCogs.length * 100,
      ) / 100
    : null;

  return {
    avgMarginPercent,
    productsWithCogs: withCogs.length,
    totalProducts: products.length,
  };
}
