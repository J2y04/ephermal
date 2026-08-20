'use client';

import { useCountUp } from './motion';

/**
 * Any number rendered anywhere in the admin panel goes through this, not just
 * the headline tiles. A dashboard where the four big figures animate and the
 * twenty smaller ones snap looks half-finished; the point is that the whole
 * page resolves as one motion.
 *
 * `value` null means "no data": renders `fallback` and never counts, because
 * counting to zero would claim a measurement that was not made.
 */
export default function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  fallback = '—',
}: {
  value: number | null | undefined;
  format?: (n: number) => string;
  fallback?: string;
}) {
  const target = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const n = useCountUp(target);
  if (target === null) return <>{fallback}</>;
  return <>{format(n)}</>;
}
