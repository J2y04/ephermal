'use client';
import { motion, type Transition } from 'framer-motion';

const springBase: Transition = { type: 'spring', stiffness: 50, damping: 13 };

interface Stat {
  num: string;
  label: string;
}

export default function StatsMotion({ stats }: { stats: Stat[] }) {
  return (
    <>
      {stats.map((s, i) => (
        <motion.div
          key={i}
          className="stat-block"
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ ...springBase, delay: i * 0.1 } as Transition}
        >
          <div className="stat-num">{s.num}</div>
          <div className="stat-label">{s.label}</div>
        </motion.div>
      ))}
    </>
  );
}
