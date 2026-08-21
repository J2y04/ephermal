/**
 * Ephermal — shared margin helper
 *
 * Used by profit-tracker (per-product table), mrr-tracker (blended estimate) and
 * campaign-launcher (unit economics handed to the model) so those three can never
 * drift on what counts as "has COGS" or how a margin ends up computed.
 *
 * Two different numbers live here and the distinction is the whole point:
 *
 *   gross margin        (price - COGS) / price
 *   contribution margin (price - COGS - variable costs) / price
 *
 * Gross margin is what most ad tooling reports and it flatters every account,
 * because payment processing, absorbed shipping and per-order handling all come
 * out before the merchant actually keeps anything. A product at 22% gross margin
 * with 2.9% + 30c processing and 4.50 of shipping is underwater on a 4x ROAS
 * order while every dashboard shows that 4x in green.
 *
 * Break-even ROAS is derived from CONTRIBUTION margin wherever fees are known,
 * because a break-even computed off gross margin is optimistic by exactly the
 * fee load, which is the error this module exists to stop making.
 *
 * Everything is integer cents internally. Percentages are whole numbers (2.9
 * means 2.9%), matching how processors quote them and how the settings UI asks.
 */

export interface VariableCosts {
  /** Payment processor percentage of order value, e.g. 2.9. */
  paymentPct: number;
  /** Fixed payment processor fee per order, in cents, e.g. 30. */
  paymentFixedCents: number;
  /** Shipping per order the merchant absorbs, in cents. */
  shippingCents: number;
  /** Other variable cost as a percentage: pick and pack, marketplace fees. */
  otherPct: number;
}

/** The "merchant has not told us their fees" case. Contribution then equals
 *  gross, and callers must label the number gross rather than implying we
 *  accounted for costs nobody gave us. */
export const NO_VARIABLE_COSTS: VariableCosts = {
  paymentPct: 0,
  paymentFixedCents: 0,
  shippingCents: 0,
  otherPct: 0,
};

/** True when at least one real fee input exists. Drives whether the UI and the
 *  model prompt are allowed to say "contribution". */
export function hasVariableCosts(f: VariableCosts): boolean {
  return f.paymentPct > 0 || f.paymentFixedCents > 0 || f.shippingCents > 0 || f.otherPct > 0;
}

/** Normalises whatever came out of the database or a request body into a usable
 *  shape. Postgres numeric arrives as a string over PostgREST, and a null column
 *  on a legacy row must read as 0 rather than NaN, which would poison every
 *  downstream number silently. */
export function toVariableCosts(row: Record<string, unknown> | null | undefined): VariableCosts {
  const num = (v: unknown): number => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    paymentPct: num(row?.fee_payment_pct),
    paymentFixedCents: Math.round(num(row?.fee_payment_fixed_cents)),
    shippingCents: Math.round(num(row?.fee_shipping_cents)),
    otherPct: num(row?.fee_other_pct),
  };
}

export interface ProductMarginInput {
  price_cents: number | null;
  cogs_cents: number | null;
}

export interface ProductMarginResult {
  hasCogs: boolean;
  /** Gross: price - COGS. Unchanged from before fees existed. */
  profitPerUnitCents: number | null;
  /** Gross margin percent. Unchanged from before fees existed. */
  marginPercent: number | null;
  /** Whether the numbers below reflect real merchant-supplied fees. When false,
   *  contribution is identical to gross and must not be labelled otherwise. */
  hasVariableCosts: boolean;
  /** Total variable cost attributed to one unit at catalogue price, in cents. */
  variableCostsPerUnitCents: number | null;
  /** price - COGS - variable costs. Can be negative: that is a real answer, not
   *  an error, and it is the one worth surfacing loudest. */
  contributionPerUnitCents: number | null;
  contributionMarginPercent: number | null;
  /** Revenue multiple at which ad spend exactly consumes contribution.
   *  null when contribution is zero or negative, because no ROAS breaks even on
   *  a unit that loses money before a penny of ad spend. */
  breakEvenRoas: number | null;
}

/** Variable cost carried by one unit sold at `priceCents`.
 *
 *  The fixed component is per ORDER, not per unit, so attributing all of it to a
 *  single unit is the conservative reading: it is exactly right for a one-item
 *  order, which is the common case for the small stores this is built for, and
 *  it slightly overstates cost on a multi-item basket. Overstating cost is the
 *  safe direction of error here, since the alternative is telling someone a
 *  losing product is profitable. */
function variableCostCents(priceCents: number, f: VariableCosts): number {
  const pctPart = priceCents * ((f.paymentPct + f.otherPct) / 100);
  return Math.round(pctPart) + f.paymentFixedCents + f.shippingCents;
}

export function computeProductMargin(
  p: ProductMarginInput,
  fees: VariableCosts = NO_VARIABLE_COSTS,
): ProductMarginResult {
  const price = p.price_cents ?? 0;
  const cogs = p.cogs_cents ?? 0;
  const hasCogs = (p.cogs_cents ?? null) !== null && p.cogs_cents! >= 0;
  const feesKnown = hasVariableCosts(fees);

  const profitPerUnitCents = hasCogs ? price - cogs : null;
  const marginPercent = hasCogs && price > 0
    ? Math.round(((price - cogs) / price) * 10000) / 100
    : null;

  // Without COGS there is no honest contribution figure either, since the
  // largest variable cost of all is the unknown one.
  if (!hasCogs || price <= 0) {
    return {
      hasCogs,
      profitPerUnitCents,
      marginPercent,
      hasVariableCosts: feesKnown,
      variableCostsPerUnitCents: null,
      contributionPerUnitCents: null,
      contributionMarginPercent: null,
      breakEvenRoas: null,
    };
  }

  const variableCostsPerUnitCents = variableCostCents(price, fees);
  const contributionPerUnitCents = price - cogs - variableCostsPerUnitCents;
  const contributionMarginPercent =
    Math.round((contributionPerUnitCents / price) * 10000) / 100;

  // 1 / contribution-margin. At 40% contribution you need 2.5x revenue on spend
  // to break even. At or below zero contribution there is no such multiple.
  const breakEvenRoas = contributionPerUnitCents > 0
    ? Math.round((price / contributionPerUnitCents) * 100) / 100
    : null;

  return {
    hasCogs,
    profitPerUnitCents,
    marginPercent,
    hasVariableCosts: feesKnown,
    variableCostsPerUnitCents,
    contributionPerUnitCents,
    contributionMarginPercent,
    breakEvenRoas,
  };
}

export interface CatalogMarginResult {
  avgMarginPercent: number | null;
  /** Null when no fees are configured, so a caller cannot accidentally present
   *  gross as contribution. */
  avgContributionMarginPercent: number | null;
  hasVariableCosts: boolean;
  productsWithCogs: number;
  totalProducts: number;
  /** Products whose contribution is zero or negative at catalogue price. These
   *  cannot be made profitable by better targeting and are worth naming. */
  productsLosingMoney: number;
}

/** Simple (unweighted) average across products that have COGS set.
 *  Not weighted by units sold or revenue — no caller has per-order or per-SKU
 *  revenue available — so this is a catalog-level estimate, not a true blended
 *  margin. Callers must label anything derived from it "Estimated". */
export function computeCatalogMargin(
  products: ProductMarginInput[],
  fees: VariableCosts = NO_VARIABLE_COSTS,
): CatalogMarginResult {
  const feesKnown = hasVariableCosts(fees);
  const margins = products.map(p => computeProductMargin(p, fees));
  const withCogs = margins.filter(m => m.hasCogs);

  const avg = (nums: number[]): number | null =>
    nums.length > 0
      ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100
      : null;

  const grossValues = withCogs
    .map(m => m.marginPercent)
    .filter((n): n is number => n !== null);
  const contributionValues = withCogs
    .map(m => m.contributionMarginPercent)
    .filter((n): n is number => n !== null);

  return {
    avgMarginPercent: avg(grossValues),
    avgContributionMarginPercent: feesKnown ? avg(contributionValues) : null,
    hasVariableCosts: feesKnown,
    productsWithCogs: withCogs.length,
    totalProducts: products.length,
    productsLosingMoney: withCogs.filter(
      m => m.contributionPerUnitCents !== null && m.contributionPerUnitCents <= 0,
    ).length,
  };
}
