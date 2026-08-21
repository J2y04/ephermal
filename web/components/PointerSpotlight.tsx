'use client';
import { useEffect } from 'react';

/**
 * Tracks the pointer across the pricing cards and writes its position to
 * --mx/--my on the hovered card. The CSS in globals.css turns that into a soft
 * light following the cursor.
 *
 * Values are written straight to the element's style. Putting pointer position
 * into React state would re-render the tree on every mousemove, which is the
 * usual way this effect ends up janky.
 *
 * Listens on a container rather than per card, and does the write inside a
 * rAF so several moves in one frame collapse into a single style change.
 * Renders nothing.
 */
export default function PointerSpotlight() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Coarse pointers have no hover, so the listener would only cost work.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const grid = document.querySelector<HTMLElement>('.pricing-grid, .price-grid');
    if (!grid) return;

    let frame = 0;
    let pending: { card: HTMLElement; x: number; y: number } | null = null;

    const apply = () => {
      frame = 0;
      if (!pending) return;
      const { card, x, y } = pending;
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);
      pending = null;
    };

    const onMove = (e: PointerEvent) => {
      const card = (e.target as HTMLElement)?.closest<HTMLElement>('.price-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      pending = { card, x: e.clientX - r.left, y: e.clientY - r.top };
      if (!frame) frame = requestAnimationFrame(apply);
    };

    grid.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      grid.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
