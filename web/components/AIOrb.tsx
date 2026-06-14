'use client';
import { useRef, useState, useEffect, useCallback } from 'react';

type Node = { id: string; label: string; x: number; y: number };

const AGENTS = [
  'Store Analyzer', 'Copy Agent', 'UGC Agent',
  'Meta Agent', 'Audience Agent', 'Analytics Agent',
];

function buildNodes(cx: number, cy: number, r: number): Node[] {
  const core: Node = { id: 'core', label: 'Orchestrator', x: cx, y: cy };
  const agents = AGENTS.map((name, i) => {
    const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
    return { id: `a${i}`, label: name, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
  return [core, ...agents];
}

export default function AIOrb() {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const svgRef   = useRef<SVGSVGElement>(null);
  const dragRef  = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const [dim, setDim]     = useState({ w: 420, h: 420 });
  const [nodes, setNodes] = useState<Node[]>([]);

  /* size observer */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = (w: number, h: number) => {
      setDim({ w, h });
      setNodes(buildNodes(w / 2, h / 2, Math.min(w, h) * 0.34));
    };
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      fit(width || 420, height || 420);
    });
    ro.observe(el);
    fit(el.clientWidth || 420, el.clientHeight || 420);
    return () => ro.disconnect();
  }, []);

  /* SVG coords helper */
  const toSVG = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return pt.matrixTransform(m.inverse());
  }, []);

  /* mouse drag */
  const startDrag = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const p = toSVG(e.clientX, e.clientY);
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    dragRef.current = { id, ox: p.x - node.x, oy: p.y - node.y };
  }, [nodes, toSVG]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { id, ox, oy } = dragRef.current;
      const p = toSVG(e.clientX, e.clientY);
      setNodes(prev => prev.map(n => n.id === id ? { ...n, x: p.x - ox, y: p.y - oy } : n));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [toSVG]);

  /* touch drag */
  const startTouch = useCallback((e: React.TouchEvent, id: string) => {
    const t = e.touches[0];
    const p = toSVG(t.clientX, t.clientY);
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    dragRef.current = { id, ox: p.x - node.x, oy: p.y - node.y };
  }, [nodes, toSVG]);

  useEffect(() => {
    const move = (e: TouchEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      const { id, ox, oy } = dragRef.current;
      const t = e.touches[0];
      const p = toSVG(t.clientX, t.clientY);
      setNodes(prev => prev.map(n => n.id === id ? { ...n, x: p.x - ox, y: p.y - oy } : n));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
  }, [toSVG]);

  if (!nodes.length) return <div ref={wrapRef} style={{ width: '100%', height: '100%' }} />;

  const core   = nodes[0];
  const agents = nodes.slice(1);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', minHeight: 340 }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${dim.w} ${dim.h}`}
        style={{ display: 'block', userSelect: 'none', touchAction: 'none' }}
      >
        {/* edges */}
        {agents.map(a => (
          <line
            key={`e-${a.id}`}
            x1={core.x} y1={core.y}
            x2={a.x}    y2={a.y}
            stroke="rgba(6,214,199,0.15)"
            strokeWidth="1"
            strokeDasharray="5 5"
          />
        ))}

        {/* agent nodes */}
        {agents.map(a => {
          const parts = a.label.split(' ');
          return (
            <g
              key={a.id}
              onMouseDown={e => startDrag(e, a.id)}
              onTouchStart={e => startTouch(e, a.id)}
              style={{ cursor: 'grab' }}
            >
              <circle
                cx={a.x} cy={a.y} r={26}
                fill="rgba(8,8,12,0.85)"
                stroke="rgba(6,214,199,0.2)"
                strokeWidth="1"
              />
              {parts.map((word, wi) => (
                <text
                  key={wi}
                  x={a.x}
                  y={a.y + wi * 10 - (parts.length - 1) * 5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(200,205,255,0.85)"
                  fontSize="7.5"
                  fontFamily="Inter, system-ui, sans-serif"
                  fontWeight="500"
                >
                  {word}
                </text>
              ))}
            </g>
          );
        })}

        {/* centre orb */}
        <g
          onMouseDown={e => startDrag(e, 'core')}
          onTouchStart={e => startTouch(e, 'core')}
          style={{ cursor: 'grab' }}
        >
          {/* outer ring */}
          <circle
            cx={core.x} cy={core.y} r={42}
            fill="none"
            stroke="rgba(6,214,199,0.12)"
            strokeWidth="1"
          />
          {/* inner fill */}
          <circle
            cx={core.x} cy={core.y} r={36}
            fill="rgba(8,8,12,0.92)"
            stroke="rgba(6,214,199,0.4)"
            strokeWidth="1.5"
          />
          <text
            x={core.x} y={core.y - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(240,242,255,0.95)"
            fontSize="9"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight="700"
            letterSpacing="0.5"
          >
            Ephermal
          </text>
          <text
            x={core.x} y={core.y + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(6,214,199,0.6)"
            fontSize="7.5"
            fontFamily="Inter, system-ui, sans-serif"
          >
            Orchestrator
          </text>
        </g>

        {/* subtle hint */}
        <text
          x={dim.w / 2}
          y={dim.h - 10}
          textAnchor="middle"
          fill="rgba(136,146,176,0.25)"
          fontSize="7"
          fontFamily="Inter, system-ui, sans-serif"
        >
          drag to rearrange
        </text>
      </svg>
    </div>
  );
}
