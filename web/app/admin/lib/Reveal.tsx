'use client';

import { motion } from 'framer-motion';

/**
 * Scroll-reveal wrapper — fades/slides a widget in once as it enters the
 * viewport. `once: true` so it never re-triggers scrolling back up, which
 * reads as more stable/premium than a repeating reveal (see design research:
 * every reference dashboard that uses scroll-reveal treats it as a one-shot
 * entrance, not a scroll-position-driven animation).
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
