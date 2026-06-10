'use client';
import { useEffect, useRef } from 'react';

const AGENTS = [
  { num: '01', name: 'Store Analyzer', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { num: '02', name: 'Copy Agent',     icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' },
  { num: '03', name: 'UGC Agent',      icon: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z' },
  { num: '04', name: 'Meta Agent',     icon: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' },
  { num: '05', name: 'Google Agent',   icon: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z' },
  { num: '06', name: 'Audience Agent', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { num: '07', name: 'Analytics',      icon: 'M18 20V10M12 20V4M6 20v-6' },
];

const R = 162;
const CX = 230;
const CY = 230;

function nodePos(i: number) {
  const angle = (i / AGENTS.length) * 2 * Math.PI - Math.PI / 2;
  return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
}

export default function AgentNetwork() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodes = containerRef.current?.querySelectorAll<HTMLElement>('.an-node');
    const lines = containerRef.current?.querySelectorAll<SVGLineElement>('.an-line');
    const dots  = containerRef.current?.querySelectorAll<SVGCircleElement>('.an-dot');
    if (!nodes || !lines || !dots) return;

    let step = 0;
    const ACTIVE = 2;

    const tick = () => {
      nodes.forEach((n, i) => n.classList.toggle('active', i >= step && i < step + ACTIVE));
      lines.forEach((l, i) => l.classList.toggle('active', i >= step && i < step + ACTIVE));
      dots.forEach((d, i)  => d.classList.toggle('active', i >= step && i < step + ACTIVE));
      step = (step + 1) % AGENTS.length;
    };
    tick();
    const id = setInterval(tick, 950);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="an-wrap" ref={containerRef}>
      <svg className="an-svg" viewBox="0 0 460 460" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#5558e8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#5558e8" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* glow halo behind hub */}
        <circle cx={CX} cy={CY} r="72" fill="url(#hubGrad)" className="an-halo" />

        {/* connection lines */}
        {AGENTS.map((_, i) => {
          const { x, y } = nodePos(i);
          return (
            <line
              key={i}
              className="an-line"
              x1={CX} y1={CY} x2={x} y2={y}
              stroke="rgba(85,88,232,0.18)"
              strokeWidth="1"
              strokeDasharray="5 6"
            />
          );
        })}

        {/* traveling signal dots (one per line) */}
        {AGENTS.map((_, i) => {
          const { x, y } = nodePos(i);
          return (
            <circle key={i} className="an-dot" r="3" fill="#5558e8" filter="url(#glow)">
              <animateMotion
                dur="0.95s"
                repeatCount="indefinite"
                path={`M ${CX} ${CY} L ${x} ${y}`}
              />
            </circle>
          );
        })}
      </svg>

      {/* center hub */}
      <div className="an-hub">
        <div className="an-hub-ring an-hub-ring1" />
        <div className="an-hub-ring an-hub-ring2" />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
        <span>Orchestrator</span>
      </div>

      {/* agent nodes */}
      {AGENTS.map((a, i) => {
        const { x, y } = nodePos(i);
        return (
          <div
            key={i}
            className="an-node"
            style={{ left: x - 46, top: y - 32 }}
          >
            <div className="an-node-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={a.icon} />
              </svg>
            </div>
            <div className="an-node-text">
              <div className="an-node-num">{a.num}</div>
              <div className="an-node-name">{a.name}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
