'use client';

import type { ReactNode } from 'react';
import Squircle from '../Squircle';
import { INK, STATUS, smoothPath } from './tokens';

/**
 * The number widget. Used for every metric whose job is a single headline:
 * user counts, signup counts, active subscriptions, bans. These are magnitudes
 * at a point in time, not shapes over time, so a plotted axis would add ink
 * without adding meaning. A stat tile is the correct form, not a lesser one.
 *
 * Optional sparkline: shown only when a metric genuinely has a trend worth a
 * glance. It carries no axis and no labels on purpose. It is a texture that
 * says "rising" or "flat", and the real series lives in the full chart.
 */

export interface StatTileProps {
  label: string;
  value: string;
  /** Round icon chip, top-right. Pass an inline <svg>, sized 18. */
  icon: ReactNode;
  /** Signed percentage change. Positive is not assumed to be good: pass
   *  invertDelta for metrics where up is bad (bans, failures). */
  delta?: number | null;
  invertDelta?: boolean;
  /** Short qualifier under the number, e.g. "last 30 days". */
  caption?: string;
  /** Bare series for the sparkline. Omit for no sparkline. */
  spark?: number[];
  /** Muted treatment for a metric that has no data source connected yet. */
  dimmed?: boolean;
}

function Spark({ values }: { values: number[] }) {
  const w = 96;
  const h = 28;
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - ((v - min) / span) * (h - 4) - 2,
  }));
  const d = smoothPath(pts);
  const last = pts[pts.length - 1];
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} fill="none" stroke={INK.muted} strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
      {/* Emphasised endpoint: the eye should land on "now", not on the whole line. */}
      <circle cx={last.x} cy={last.y} r="2.5" fill={INK.primary} />
    </svg>
  );
}

export default function StatTile({
  label,
  value,
  icon,
  delta,
  invertDelta = false,
  caption,
  spark,
  dimmed = false,
}: StatTileProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0;
  const rising = hasDelta && (delta as number) > 0;
  const good = invertDelta ? !rising : rising;
  const deltaColor = !hasDelta ? INK.muted : good ? STATUS.good : STATUS.critical;

  return (
    <Squircle
      cornerRadius={22}
      className="widget-shadow group relative flex flex-col justify-between border border-eph-border bg-eph-surface p-5 transition-colors duration-200 hover:border-eph-primary/30"
      style={{ minHeight: 132 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: INK.muted }}
        >
          {label}
        </div>

        {/* Round icon chip, top corner. */}
        <span
          aria-hidden="true"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full transition-colors duration-200"
          style={{
            background: 'rgba(6,214,199,0.10)',
            color: dimmed ? INK.muted : '#06D6C7',
            boxShadow: 'inset 0 0 0 1px rgba(6,214,199,0.18)',
          }}
        >
          {icon}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[34px] font-semibold leading-none tracking-[-0.02em]"
            style={{
              color: dimmed ? INK.muted : INK.primary,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </div>

          <div className="mt-2 flex items-center gap-2">
            {hasDelta && (
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold"
                style={{ color: deltaColor, fontVariantNumeric: 'tabular-nums' }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                  <path
                    d={rising ? 'M5 1.5 L9 8 L1 8 Z' : 'M5 8.5 L1 2 L9 2 Z'}
                    fill="currentColor"
                  />
                </svg>
                {Math.abs(delta as number).toFixed(1)}%
              </span>
            )}
            {caption && (
              <span className="truncate text-xs" style={{ color: INK.muted }}>
                {caption}
              </span>
            )}
          </div>
        </div>

        {spark && spark.length > 1 && (
          <div className="flex-shrink-0 pb-0.5 opacity-80 transition-opacity duration-200 group-hover:opacity-100">
            <Spark values={spark} />
          </div>
        )}
      </div>
    </Squircle>
  );
}
