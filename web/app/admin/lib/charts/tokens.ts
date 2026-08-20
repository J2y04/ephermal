/**
 * Chart tokens for the admin panel.
 *
 * Every categorical and status value below was generated at a target OKLCH
 * lightness and then run through the palette validator against the real dark
 * surface (#0F0F13), rather than picked by eye. That matters, because the
 * palette these replace did not survive the check: the previous --chart-1 teal
 * (#06D6C7) and --chart-2 green (#34D399) sat at deltaE 6.1 for NORMAL vision,
 * below the 15 floor, meaning full-sight readers could not reliably tell two
 * adjacent series apart. Colourblind readers had no chance.
 *
 * Results, dark surface, adjacent-pair mode:
 *   categorical  blue/amber/violet   worst pair deltaE 24.2 normal, 23.6 deutan  PASS
 *   status       good/warn/critical  worst pair deltaE 15.3 normal              PASS
 *
 * Do not add a fourth categorical hue without re-running the validator. Blue
 * and violet already collapse to deltaE 2.9 under deuteranopia once a fifth
 * slot pushes them adjacent, so a wider set needs re-stepping, not appending.
 */

/** Brand accent. Single-series charts use this: one series needs contrast, not
 *  categorical separation, so the brand colour is free here and keeps identity. */
export const ACCENT = '#06D6C7';

/** Categorical identity. Fixed order, never cycled. */
export const CATEGORICAL = ['#4289d4', '#b27a00', '#996fc7'] as const;

/** Reserved for state. Never reused as "series 4", and always shipped with a
 *  label so state is never carried by colour alone. */
export const STATUS = {
  good: '#219761',
  warning: '#ae8e00',
  critical: '#ba2840',
  neutral: '#5b6472',
} as const;

/** Ordinal progression (starter -> growth -> scale). A sequential ramp, one hue
 *  light to dark, because plan tiers are ordered rather than merely different. */
export const TIER_RAMP = ['#26bdae', '#009d90', '#007e72'] as const;

export const INK = {
  primary: '#eef0f7',
  secondary: '#9aa3b2',
  muted: '#7b8794',
  grid: 'rgba(255,255,255,0.06)',
  axis: 'rgba(255,255,255,0.10)',
  surface: '#0f0f13',
} as const;

/** Compact figures for tiles: 1200 -> 1.2k. Full precision stays in tooltips. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function money(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format((cents || 0) / 100);
}

/** Catmull-Rom to cubic Bezier. Gives the eased line Stripe-style charts use,
 *  without the overshoot a naive cardinal spline produces on sharp changes. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** "Nice" axis ceiling so gridlines land on readable numbers. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  const norm = max / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
