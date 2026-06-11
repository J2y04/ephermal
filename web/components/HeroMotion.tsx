'use client';
import { motion, type Transition } from 'framer-motion';

const BASE: Transition = { type: 'spring', stiffness: 55, damping: 13 };

const GRADIENT_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, #5558e8 0%, #8b5cf6 45%, #06d6c7 100%)',
  backgroundSize: '200% 200%',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  animation: 'gradientDrift 7s ease-in-out infinite alternate',
};

/** Mask wrapper — clips the word so it slides up from below */
function MaskWord({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{
      display: 'inline-block',
      overflow: 'hidden',
      verticalAlign: 'bottom',
      paddingBottom: '0.06em',
      marginRight: '0.22em',
    }}>
      <span style={{ display: 'inline-block', ...style }}>
        {children}
      </span>
    </span>
  );
}

function Word({
  word, index, gradient,
}: { word: string; index: number; gradient?: boolean }) {
  return (
    <MaskWord style={gradient ? GRADIENT_STYLE : undefined}>
      <motion.span
        initial={{ y: '108%', opacity: gradient ? 1 : 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...BASE, delay: index * 0.1 } as Transition}
        style={{ display: 'inline-block' }}
      >
        {word}
      </motion.span>
    </MaskWord>
  );
}

interface HeroMotionProps {
  line1: string[];
  line2: string[];
  sub: React.ReactNode;
  cta: React.ReactNode;
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
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...BASE, delay: 0.6 } as Transition}
      >
        {sub}
      </motion.p>

      <motion.div
        className="hero-actions"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...BASE, delay: 0.75 } as Transition}
      >
        {cta}
      </motion.div>
    </>
  );
}
