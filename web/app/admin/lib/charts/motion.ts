'use client';

import { useEffect, useRef, useState } from 'react';

/** Honour the OS "reduce motion" setting. Someone who gets motion sickness from
 *  a counting number should see the final figure immediately, not a slower
 *  version of the same animation. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** easeOutExpo: very fast off the mark, then a long settle into the target.
 *  That shape is the point. A linear count reads like a loading spinner; this
 *  reads like a value arriving and coming to rest. */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - 2 ** (-10 * t);
}

/**
 * Counts from 0 to `target` on mount, and again whenever the target changes.
 *
 * Driven by requestAnimationFrame against real elapsed time rather than a fixed
 * per-frame step, so it takes the same wall-clock duration on a 60Hz and a
 * 144Hz display instead of finishing twice as fast on the latter.
 */
export function useCountUp(target: number | null, duration = 1100): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? (target ?? 0) : 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (target == null) {
      setValue(0);
      return;
    }
    if (reduced) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (target - from) * easeOutExpo(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [target, duration, reduced]);

  return value;
}

/**
 * Flips to true one frame after mount (or after `key` changes), which is what
 * lets a CSS transition actually run: setting the final state in the same paint
 * as the initial state produces no transition at all, the browser just draws
 * the end state.
 */
export function useDrawIn(key: unknown = null): boolean {
  const reduced = usePrefersReducedMotion();
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (reduced) {
      setOn(true);
      return;
    }
    setOn(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, [key, reduced]);

  return on;
}

/** Shared easing for the chart reveals, so a tile and the chart beside it feel
 *  like one motion rather than two unrelated ones. */
export const DRAW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
