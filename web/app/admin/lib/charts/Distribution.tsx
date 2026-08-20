'use client';

import { INK } from './tokens';

/**
 * The non-coordinate forms.
 *
 * A plotted x/y axis answers "how did this change". Most admin metrics are not
 * asking that. Composition ("how do campaigns split across states"), coverage
 * ("how many of my users connected Shopify") and a single ratio ("what share of
 * products have COGS") each have a better form than a line, and none of them is
 * a pie chart: angle is the hardest visual channel to compare, so a segmented
 * bar beats a donut at the same job.
 */

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/**
 * Part-to-whole. Segments are separated by a 2px surface-coloured gap so
 * adjacent fills never touch, which is what stops a stacked bar reading as one
 * smeared block. Every segment is directly labelled beneath, so identity never
 * rests on colour alone.
 */
export function SegmentedBar({
  segments,
  height = 12,
  emptyLabel = 'Nothing recorded yet',
}: {
  segments: Segment[];
  height?: number;
  emptyLabel?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);

  if (total <= 0) {
    return (
      <div>
        <div
          className="w-full rounded-full"
          style={{ height, background: 'rgba(255,255,255,0.05)' }}
          role="img"
          aria-label={emptyLabel}
        />
        <div className="mt-3 text-xs" style={{ color: INK.muted }}>
          {emptyLabel}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full"
        style={{ height, gap: 2, background: 'rgba(255,255,255,0.05)' }}
        role="img"
        aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${s.value}`}
              style={{
                width: `${(s.value / total) * 100}%`,
                background: s.color,
                borderRadius: 999,
                transition: 'filter 160ms ease',
              }}
              className="hover:brightness-110"
            />
          ))}
      </div>

      <ul className="mt-3 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span style={{ color: INK.secondary }}>{s.label}</span>
            <span
              className="font-semibold"
              style={{ color: INK.primary, fontVariantNumeric: 'tabular-nums' }}
            >
              {s.value}
            </span>
            <span style={{ color: INK.muted, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Coverage against a known ceiling. Reads as "9 of 12", which a bare count
 * cannot express: 9 connected stores means nothing without the denominator.
 */
export function BulletBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px]" style={{ color: INK.secondary }}>
          {label}
        </span>
        <span
          className="text-[13px] font-semibold"
          style={{ color: INK.primary, fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
          <span style={{ color: INK.muted }} className="font-normal">
            {' '}
            / {total}
          </span>
        </span>
      </div>
      <div
        className="mt-2 w-full overflow-hidden rounded-full"
        style={{ height: 6, background: 'rgba(255,255,255,0.06)' }}
        role="img"
        aria-label={`${label}: ${value} of ${total}`}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 999,
            transition: 'width 420ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>
    </div>
  );
}

/**
 * A single ratio. An arc rather than a bar purely because one hero percentage
 * deserves a distinct shape on the page, and the number in the middle is the
 * real payload: the arc is the qualifier, not the measurement.
 */
export function RadialArc({
  value,
  label,
  color,
  size = 132,
}: {
  value: number;
  label: string;
  color: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  // Leave a gap at the bottom so the ring reads as a gauge, not a pie.
  const sweep = 0.78;
  const dash = circ * sweep;
  const filled = dash * (pct / 100);

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${pct.toFixed(1)} percent`}
        style={{ transform: 'rotate(140deg)' }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 520ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="-mt-[86px] flex flex-col items-center pb-[54px]">
        <div
          className="text-[26px] font-semibold leading-none tracking-[-0.02em]"
          style={{ color: INK.primary, fontVariantNumeric: 'tabular-nums' }}
        >
          {pct.toFixed(pct % 1 === 0 ? 0 : 1)}%
        </div>
        <div className="mt-1.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: INK.muted }}>
          {label}
        </div>
      </div>
    </div>
  );
}
