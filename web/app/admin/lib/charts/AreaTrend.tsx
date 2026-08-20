'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ACCENT, INK, niceMax, smoothPath } from './tokens';
import { useDrawIn, DRAW_EASE } from './motion';

/**
 * Time-series area chart, hand-authored SVG.
 *
 * Reserved for metrics whose job really is change-over-time: signups per day,
 * revenue, ad spend. A count that has no time dimension gets a StatTile instead.
 *
 * A single series, so no legend box: the title names the series, and colour
 * carries no identity load. Values sit in the crosshair tooltip rather than on
 * every point, because a number on each mark is noise at 30+ points.
 */

export interface AreaTrendPoint {
  date: string;
  value: number;
}

export interface AreaTrendProps {
  points: AreaTrendPoint[];
  /** Formats the tooltip value. Defaults to a plain integer. */
  format?: (v: number) => string;
  height?: number;
  /** Grow to fill the container's height instead of using a fixed height. Used
   *  when the chart shares a grid row with a taller panel, so the card does not
   *  end in a band of dead space. */
  fill?: boolean;
  color?: string;
  /** Renders the empty-state message instead of a flat zero line, so a chart
   *  never implies "measured zero" when it actually means "nothing recorded". */
  emptyLabel?: string;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

export default function AreaTrend({
  points,
  format = (v) => String(Math.round(v)),
  height = 260,
  fill = false,
  color = ACCENT,
  emptyLabel,
}: AreaTrendProps) {
  const gid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const [boxH, setBoxH] = useState(height);
  const h = fill ? boxH : height;
  // Re-runs whenever the series itself changes, so switching date range redraws
  // rather than snapping to the new shape.
  const drawn = useDrawIn(points.length ? points.map((p) => p.value).join(',') : 'empty');

  const allZero = points.length > 0 && points.every((p) => !p.value);

  const geom = useMemo(() => {
    const w = Math.max(320, width);
    const innerW = w - PAD.left - PAD.right;
    const innerH = h - PAD.top - PAD.bottom;
    const max = niceMax(Math.max(1, ...points.map((p) => p.value)));
    const xs = (i: number) =>
      PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const ys = (v: number) => PAD.top + innerH - (v / max) * innerH;
    const pts = points.map((p, i) => ({ x: xs(i), y: ys(p.value) }));
    return { w, innerW, innerH, max, xs, ys, pts };
  }, [points, width, h]);

  // Track container width without a resize library. In an effect, with a real
  // disconnect: attaching the observer inside the ref callback created a fresh
  // one on every render and never tore any of them down.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const cw = entry.contentRect.width;
      if (cw) setWidth((prev) => (Math.abs(cw - prev) > 1 ? cw : prev));
      const ch = entry.contentRect.height;
      if (ch) setBoxH((prev) => (Math.abs(ch - prev) > 1 ? ch : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const line = smoothPath(geom.pts);
  const area =
    geom.pts.length > 1
      ? `${line} L${geom.pts[geom.pts.length - 1].x} ${PAD.top + geom.innerH} L${geom.pts[0].x} ${
          PAD.top + geom.innerH
        } Z`
      : '';

  const ticks = [0, 0.5, 1].map((f) => Math.round(geom.max * f));
  const active = hover != null ? points[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!points.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * geom.w;
    const rel = (x - PAD.left) / (geom.innerW || 1);
    const idx = Math.round(rel * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, idx)));
  }

  return (
    <div ref={wrapRef} className={`relative w-full ${fill ? 'h-full' : ''}`}>
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${geom.w} ${h}`}
        role="img"
        aria-label={`Trend over ${points.length} days. ${
          allZero ? 'No activity recorded in this period.' : ''
        }`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block', touchAction: 'none' }}
      >
        <defs>
          {/* Wipe from the y-axis outward: the line grows out of the origin
              rather than appearing whole. Transform on the clip rect rather
              than an animated width attribute, because only the former is
              GPU-composited and interpolable in every engine. */}
          <clipPath id={`wipe-${gid}`}>
            <rect
              x={PAD.left}
              y={0}
              width={geom.innerW}
              height={h}
              style={{
                transformOrigin: `${PAD.left}px 0px`,
                transform: drawn ? 'scaleX(1)' : 'scaleX(0)',
                transition: `transform 1000ms ${DRAW_EASE}`,
              }}
            />
          </clipPath>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="60%" stopColor={color} stopOpacity="0.06" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines: present enough to read a value against, quiet
            enough that the series is what the eye lands on. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={geom.w - PAD.right}
              y1={geom.ys(t)}
              y2={geom.ys(t)}
              stroke={INK.grid}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 10}
              y={geom.ys(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill={INK.muted}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t}
            </text>
          </g>
        ))}

        {!allZero && (
          <g clipPath={`url(#wipe-${gid})`}>
            {area && <path d={area} fill={`url(#fill-${gid})`} />}
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {allZero && (
          <text
            x={geom.w / 2}
            y={PAD.top + geom.innerH / 2}
            textAnchor="middle"
            fontSize="12"
            fill={INK.muted}
          >
            {emptyLabel ?? 'No activity recorded in this period'}
          </text>
        )}

        {/* First and last date only. A tick per day is unreadable and pointless. */}
        {points.length > 1 && (
          <>
            <text x={PAD.left} y={h - 6} fontSize="11" fill={INK.muted}>
              {points[0].date.slice(5)}
            </text>
            <text
              x={geom.w - PAD.right}
              y={h - 6}
              textAnchor="end"
              fontSize="11"
              fill={INK.muted}
            >
              {points[points.length - 1].date.slice(5)}
            </text>
          </>
        )}

        {hover != null && points[hover] && !allZero && (
          <g pointerEvents="none">
            <line
              x1={geom.xs(hover)}
              x2={geom.xs(hover)}
              y1={PAD.top}
              y2={PAD.top + geom.innerH}
              stroke={INK.axis}
              strokeWidth="1"
            />
            {/* 2px surface ring so the marker reads on top of the line. */}
            <circle
              cx={geom.xs(hover)}
              cy={geom.ys(points[hover].value)}
              r="5"
              fill={color}
              stroke={INK.surface}
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {active && !allZero && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(geom.xs(hover as number) / geom.w) * 100}%`,
            top: 4,
            background: 'rgba(20,20,26,0.96)',
            border: '1px solid rgba(255,255,255,0.09)',
            color: INK.primary,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ color: INK.muted }}>{active.date}</div>
          <div className="mt-0.5 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {format(active.value)}
          </div>
        </div>
      )}
    </div>
  );
}
