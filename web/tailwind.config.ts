import type { Config } from 'tailwindcss';

// Scoped ONLY to the admin panel — Tailwind's utility-class generation and its
// `@tailwind base` Preflight reset must never reach the marketing site
// (web/app/page.tsx etc., hand-written CSS in globals.css) or the static
// dashboard.html, which is served as-is and never compiled by Next.js anyway.
// If a future section of the app wants Tailwind too, broaden `content` then —
// don't do it preemptively.
const config: Config = {
  content: [
    './app/admin/**/*.{ts,tsx}',
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  // Tremor's chart/badge components pick their fill/stroke/bg/text/ring color
  // at runtime from a color-name prop (e.g. color="cyan"), which Tailwind's
  // static content scanner can't see as a literal class string — without this
  // safelist, classes like `fill-cyan-500` never get generated and charts
  // render with the browser's default black fill. Scoped to just the colors
  // this admin panel actually uses (see the `color`/`colors` props in
  // app/admin/page.tsx and users/page.tsx) rather than Tremor's full palette.
  safelist: [
    {
      pattern: /^(bg|text|border|ring|stroke|fill)-(cyan|violet|amber|emerald|rose)-(50|100|200|300|400|500|600|700|800|900|950)$/,
      variants: ['hover', 'dark', 'dark:hover'],
    },
  ],
  theme: {
    extend: {
      colors: {
        // Ephermal's existing brand palette (web/app/globals.css :root), so the
        // admin panel's own markup matches the rest of the product instead of
        // introducing a second, unrelated color system.
        eph: {
          bg:       '#08080c',
          surface:  '#0f0f13',
          surface2: '#1a1a1f',
          surface3: '#202027',
          border:   'rgba(255,255,255,0.08)',
          borderHi: 'rgba(255,255,255,0.14)',
          primary:  '#06d6c7',
          text:     '#f5f5f7',
          muted:    '#8a8a94',
          subtle:   '#5c5c66',
          success:  '#34d399',
          warning:  '#fbbf24',
          danger:   '#f87171',
        },
        // Tremor's own components (Card, chart axes/tooltips, etc.) reference
        // these exact token names internally (tremor-ring, dark-tremor-border,
        // etc. — see Tremor's official theming docs). Without defining them,
        // Tailwind can't generate CSS for those classes and Tremor silently
        // falls back to its stock light-blue defaults — which is why the
        // first pass at this rendered with a stray blue ring around every
        // card instead of Ephermal's palette. Mapped onto the eph-* values
        // above so Tremor's internals pick up the real brand colors too.
        tremor: {
          brand: {
            faint: '#0f0f13', muted: '#1a1a1f', subtle: '#06d6c7',
            DEFAULT: '#06d6c7', emphasis: '#04bfb1', inverted: '#08080c',
          },
          background: { muted: '#0f0f13', subtle: '#1a1a1f', DEFAULT: '#0f0f13', emphasis: '#eef0f7' },
          border: { DEFAULT: 'rgba(255,255,255,0.07)' },
          ring: { DEFAULT: 'rgba(255,255,255,0.07)' },
          content: {
            subtle: '#6b7280', DEFAULT: '#6b7280', emphasis: '#eef0f7', strong: '#f7f8fa', inverted: '#08080c',
          },
        },
        'dark-tremor': {
          brand: {
            faint: '#0f0f13', muted: '#1a1a1f', subtle: '#06d6c7',
            DEFAULT: '#06d6c7', emphasis: '#7ef5ed', inverted: '#08080c',
          },
          background: { muted: '#1a1a1f', subtle: '#1a1a1f', DEFAULT: '#0f0f13', emphasis: '#eef0f7' },
          border: { DEFAULT: 'rgba(255,255,255,0.07)' },
          ring: { DEFAULT: 'rgba(255,255,255,0.07)' },
          content: {
            subtle: '#6b7280', DEFAULT: '#9ca3af', emphasis: '#eef0f7', strong: '#f7f8fa', inverted: '#08080c',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        // Apple widget-inspired scale — the bigger the widget, the rounder,
        // per the research spec (small stat cards 24px -> hero chart 32px).
        // Used as a same-value fallback alongside the real squircle clip-path
        // (see lib/Squircle.tsx) so there's no flash of sharp corners before
        // the squircle path computes on mount.
        '4xl': '28px',
        '5xl': '32px',
      },
    },
  },
  plugins: [],
};

export default config;
