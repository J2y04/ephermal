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
  // this admin panel actually uses across every page (color/colors props in
  // page.tsx, users/, platform/, and finance/) rather than Tremor's full
  // palette. slate/blue/fuchsia/gray were missing (found by audit 2026-08-06)
  // — the Starter plan-mix donut slice, the Meta campaigns-by-platform donut
  // slice, the entire funnel BarList, and the "not connected" integration
  // badge were all rendering with no color at all as a result.
  safelist: [
    {
      pattern: /^(bg|text|border|ring|stroke|fill)-(cyan|violet|amber|emerald|rose|slate|blue|fuchsia|gray)-(50|100|200|300|400|500|600|700|800|900|950)$/,
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
        // shadcn/ui components (Card, Badge, Sidebar, Chart, Table, etc. from the
        // dashboard-01 block) reference these exact token names as Tailwind utility
        // classes (bg-background, border-border, text-muted-foreground, etc.). The
        // shadcn CLI's default init assumes Tailwind v4's CSS-first @theme system,
        // which auto-generates these; this project is Tailwind v3 (config-based),
        // so they need an explicit mapping here to the CSS variables the CLI wrote
        // into admin.css's :root/.dark blocks (already restyled to Ephermal's
        // palette) — otherwise `border-border`/`bg-background` etc. don't exist and
        // the build fails outright. Merged into this SAME colors object (not a
        // second `colors:` key) since a duplicate key would silently delete the
        // eph-*/tremor-* definitions above (last key wins in a JS object literal).
        // NOTE: admin.css's :root/.dark blocks store these as raw "R G B" space-
        // separated triplets (not hex), specifically so `rgb(var(--x) / <alpha-value>)`
        // here lets Tailwind resolve opacity-modifier classes at build time
        // (bg-primary/10, ring-foreground/10, etc — used throughout the shadcn
        // dashboard-01 block). A hex/oklch value behind var() can't be alpha-mixed
        // at build time, which is what silently produced Tailwind's fallback
        // blue-500 ring on every Card until this was traced down. border/input/
        // sidebar.border are the deliberate exception: they're semi-transparent
        // rgba() by default (a hairline on a dark surface) and are never used
        // with a further opacity modifier, so they reference the CSS variable
        // directly instead.
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', foreground: 'rgb(var(--primary-foreground) / <alpha-value>)' },
        secondary: { DEFAULT: 'rgb(var(--secondary) / <alpha-value>)', foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)' },
        destructive: { DEFAULT: 'rgb(var(--destructive) / <alpha-value>)', foreground: 'rgb(var(--foreground) / <alpha-value>)' },
        muted: { DEFAULT: 'rgb(var(--muted) / <alpha-value>)', foreground: 'rgb(var(--muted-foreground) / <alpha-value>)' },
        accent: { DEFAULT: 'rgb(var(--accent) / <alpha-value>)', foreground: 'rgb(var(--accent-foreground) / <alpha-value>)' },
        popover: { DEFAULT: 'rgb(var(--popover) / <alpha-value>)', foreground: 'rgb(var(--popover-foreground) / <alpha-value>)' },
        card: { DEFAULT: 'rgb(var(--card) / <alpha-value>)', foreground: 'rgb(var(--card-foreground) / <alpha-value>)' },
        sidebar: {
          DEFAULT: 'rgb(var(--sidebar) / <alpha-value>)',
          foreground: 'rgb(var(--sidebar-foreground) / <alpha-value>)',
          primary: 'rgb(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'rgb(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent: 'rgb(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'rgb(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'var(--sidebar-border)',
          ring: 'rgb(var(--sidebar-ring) / <alpha-value>)',
        },
        chart: {
          1: 'rgb(var(--chart-1) / <alpha-value>)',
          2: 'rgb(var(--chart-2) / <alpha-value>)',
          3: 'rgb(var(--chart-3) / <alpha-value>)',
          4: 'rgb(var(--chart-4) / <alpha-value>)',
          5: 'rgb(var(--chart-5) / <alpha-value>)',
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
        // Tremor's own components (TextInput, Badge, NumberInput, Select, etc.)
        // reference these exact token names internally (rounded-tremor-small,
        // rounded-tremor-default, rounded-tremor-full — see Tremor's theming
        // docs). Without defining them, Tailwind can't generate any CSS for
        // those classes, so Tremor falls back to a 0px radius — square
        // corners on the search box and badge pills while every hand-styled
        // element around them is rounded. Same class of bug already found
        // and fixed for Tremor's color tokens above; values picked to match
        // the admin panel's existing rounded-xl (12px) / pill conventions
        // rather than Tremor's own (smaller) stock defaults.
        'tremor-small':   '10px',
        'tremor-default': '12px',
        'tremor-full':    '9999px',
      },
    },
  },
  plugins: [],
};

export default config;
