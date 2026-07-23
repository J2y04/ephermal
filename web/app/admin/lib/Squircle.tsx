'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { getSvgPath } from 'figma-squircle';

/**
 * A true Apple "continuous corner" squircle — the actual superellipse curve
 * iOS/macOS widgets use (SwiftUI's `.continuous` RoundedRectangle style),
 * not a plain CSS border-radius. A normal border-radius is a circular arc
 * grafted onto straight edges, which reads as a harsher, more mechanical
 * corner at the radii this admin panel uses (24-32px on cards this size) —
 * that harshness is a real part of why the previous pass "still looked
 * cheap" despite using a big border-radius number. The squircle curve blends
 * gradually from edge to corner with no sharp inflection point, which is
 * what actually produces the soft, "designed" Apple widget look.
 *
 * cornerSmoothing 0 == a normal rounded rect (no smoothing). Apple's own
 * widgets sit around 0.6-1; we use 0.8 as a good default (matches the
 * research spec's Apple-widget findings).
 *
 * Path is regenerated on resize via ResizeObserver, since (unlike CSS
 * border-radius) the squircle path is defined in absolute pixels for a
 * specific width/height, not resolution-independent.
 */
export default function Squircle({
  cornerRadius = 32,
  cornerSmoothing = 0.8,
  className,
  style,
  children,
}: {
  cornerRadius?: number;
  cornerSmoothing?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clipPath, setClipPath] = useState<string | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const path = getSvgPath({
        width,
        height,
        cornerRadius: Math.min(cornerRadius, Math.min(width, height) / 2),
        cornerSmoothing,
      });
      setClipPath(`path('${path}')`);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cornerRadius, cornerSmoothing]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, clipPath, WebkitClipPath: clipPath }}
    >
      {children}
    </div>
  );
}
