'use client';
import { motion, type Variants, type Transition } from 'framer-motion';

const springBase: Transition = { type: 'spring', stiffness: 60, damping: 14 };

const wordVariants: Variants = {
  hidden: { y: '110%', opacity: 0 },
  visible: (i: number) => ({
    y: '0%',
    opacity: 1,
    transition: { ...springBase, delay: i * 0.1 } as Transition,
  }),
};

const subVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { ...springBase, delay: 0.55 } as Transition },
};

const ctaVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { ...springBase, delay: 0.72 } as Transition },
};

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
        <span style={{ display: 'block', overflow: 'hidden' }}>
          {line1.map((w, i) => (
            <motion.span
              key={i}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={wordVariants}
              style={{ display: 'inline-block', marginRight: '0.22em' }}
            >
              {w}
            </motion.span>
          ))}
        </span>
        <span className="line2" style={{ display: 'block', overflow: 'hidden' }}>
          {line2.map((w, i) => (
            <motion.span
              key={i}
              custom={line1.length + i}
              initial="hidden"
              animate="visible"
              variants={wordVariants}
              style={{ display: 'inline-block', marginRight: '0.22em' }}
            >
              {w}
            </motion.span>
          ))}
        </span>
      </h1>
      <motion.div initial="hidden" animate="visible" variants={subVariants}>
        {sub}
      </motion.div>
      <motion.div initial="hidden" animate="visible" variants={ctaVariants}>
        {cta}
      </motion.div>
    </>
  );
}
