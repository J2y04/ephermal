'use client';
import { motion } from 'framer-motion';

/* Apple / Linear-style ease-out-expo — fast start, long smooth tail */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const GRADIENT: React.CSSProperties = {
  color: '#06d6c7',
};

interface HeroMotionProps {
  line1: string[];
  line2: string[];
  sub: React.ReactNode;
  cta: React.ReactNode;
  oneLine?: boolean;
}

function Word({ word, index, gradient }: { word: string; index: number; gradient?: boolean }) {
  return (
    /* Mask: clips word so it slides up from below without layout shift */
    <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.06em', marginRight: '0.22em' }}>
      <motion.span
        initial={gradient
          ? { y: '100%' }
          : { y: '100%', opacity: 0 }
        }
        animate={gradient
          ? { y: 0 }
          : { y: 0, opacity: 1 }
        }
        transition={{ duration: 0.72, ease: EASE, delay: index * 0.05 }}
        style={{ display: 'inline-block', ...(gradient ? GRADIENT : {}) }}
      >
        {word}
      </motion.span>
    </span>
  );
}

export default function HeroMotion({ line1, line2, sub, cta, oneLine }: HeroMotionProps) {
  return (
    <>
      <h1 className={oneLine ? 'hero-h1-single' : undefined}>
        <span style={{ display: oneLine ? 'inline' : 'block' }}>
          {line1.map((w, i) => <Word key={i} word={w} index={i} />)}
        </span>
        <span className="line2" style={{ display: oneLine ? 'inline' : 'block' }}>
          {line2.map((w, i) => <Word key={i} word={w} index={line1.length + i} gradient />)}
        </span>
      </h1>

      <motion.p
        className="hero-sub"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.44 }}
      >
        {sub}
      </motion.p>

      <motion.div
        className="hero-actions"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, ease: EASE, delay: 0.62 }}
      >
        {cta}
      </motion.div>
    </>
  );
}
