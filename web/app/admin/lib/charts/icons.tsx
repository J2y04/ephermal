/**
 * Tile glyphs. Deliberately thin (1.6 stroke) and drawn on a 24 grid so they sit
 * inside the round chip at the same optical weight as the label type rather than
 * shouting over it.
 */
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: 'false',
} as const;

export const GlyphUsers = () => (
  <svg {...base}>
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
    <circle cx="10" cy="8" r="3.2" />
    <path d="M20 19v-1.4a3.4 3.4 0 0 0-2.6-3.3M15.6 5.2a3.2 3.2 0 0 1 0 5.9" />
  </svg>
);

export const GlyphSpark = () => (
  <svg {...base}>
    <path d="M3 16.5 8.5 11l3.5 3.4L20.5 6" />
    <path d="M15.5 6h5v5" />
  </svg>
);

export const GlyphPulse = () => (
  <svg {...base}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
  </svg>
);

export const GlyphShield = () => (
  <svg {...base}>
    <path d="M12 3.5 5 6.2v5c0 4.2 2.9 7.6 7 9.3 4.1-1.7 7-5.1 7-9.3v-5Z" />
    <path d="M9.5 12.2 11.4 14l3.4-3.6" />
  </svg>
);

export const GlyphCoin = () => (
  <svg {...base}>
    <ellipse cx="12" cy="6.6" rx="7" ry="3.1" />
    <path d="M5 6.6v10.8c0 1.7 3.1 3.1 7 3.1s7-1.4 7-3.1V6.6" />
    <path d="M5 12c0 1.7 3.1 3.1 7 3.1s7-1.4 7-3.1" />
  </svg>
);

export const GlyphRocket = () => (
  <svg {...base}>
    <path d="M12 3c3.3 2 5 5.4 5 9l-2.6 2.6H9.6L7 12c0-3.6 1.7-7 5-9Z" />
    <circle cx="12" cy="10" r="1.6" />
    <path d="M9.6 14.6 8 19l3-1.2M14.4 14.6 16 19l-3-1.2" />
  </svg>
);
