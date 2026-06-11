'use client';
import { motion } from 'framer-motion';

/* Apple / Linear-style ease-out-expo — fast start, long smooth tail */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const GRADIENT: React.CSSProperties = {
  background: 'linear-gradient(135deg, #5558e8 0%, #8b5cf6 45%, #06d6c7 100%)',
  backgroundSize: '200% 200%',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  animation: 'gradientDrift 7s ease-in-out infinite alternate',
};

interface HeroMotionProps {
  line1: string[];
  line2: string[];
  sub: React.ReactNode;
  cta: React.ReactNode;
}

function Word({ word, index, gradient }: { word: string; index: number; gradient?: boolean }) {
  return (
    /* Mask: clips word so it slides up from below without layout shift */
    <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.06em', marginRight: '0.22em' }}>
      <motion.span
        initial={gradient
          ? { y: '100%' }
          : { y: '100%', opacity: 0, filter: 'blur(8px)' }
        }
        animate={gradient
          ? { y: 0 }
          : { y: 0, opacity: 1, filter: 'blur(0px)' }
        }
        transition={{ duration: 0.82, ease: EASE, delay: index * 0.055 }}
        style={{ display: 'inline-block', ...(gradient ? GRADIENT : {}) }}
      >
        {word}
      </motion.span>
    </span>
  );
}

export default function HeroMotion({ line1, line2, sub, cta }: HeroMotionProps) {
  return (
    <>
      <h1>
        <span style={{ display: 'block' }}>
          {line1.map((w, i) => <Word key={i} word={w} index={i} />)}
        </span>
        <span className="line2" style={{ display: 'block' }}>
          {line2.map((w, i) => <Word key={i} word={w} index={line1.length + i} gradient />)}
        </span>
      </h1>

      <motion.p
        className="hero-sub"
        initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.48 }}
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
