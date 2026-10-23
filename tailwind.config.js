import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)', surface: 'var(--surface)', 'surface-soft': 'var(--surface-2)', 'surface-3': 'var(--surface-3)',
        sidebar: 'var(--sidebar-bg)', 'sidebar-line': 'var(--sidebar-line)', 'sidebar-hover': 'var(--sidebar-hover)', 'sidebar-active': 'var(--sidebar-active)',
        ink: 'var(--text)', muted: 'var(--text-muted)', faint: 'var(--text-faint)',
        action: 'var(--action)', 'action-hover': 'var(--action-hover)', 'action-soft': 'var(--action-soft)', 'action-border': 'var(--action-border)',
        reference: 'var(--reference)', 'reference-text': 'var(--reference-text)', 'reference-soft': 'var(--reference-soft)',
        success: 'var(--success)', 'success-soft': 'var(--success-soft)', warning: 'var(--warning)', 'warning-soft': 'var(--warning-soft)',
        line: 'var(--line)', 'line-strong': 'var(--line-strong)', error: 'var(--error)', 'error-soft': 'var(--error-soft)',
      },
      // One family variable per role. The display face is a serif stack with a
      // Chinese serif fallback, which is what carries the editorial heading voice;
      // everything numeric or identifier-like is monospace so columns line up.
      fontFamily: {
        sans: ['var(--font-sans)'], body: ['var(--font-sans)'], label: ['var(--font-sans)'],
        display: ['var(--font-display)'], mono: ['var(--font-mono)'],
      },
      // The dense instrument type scale. The audit's P1-2: ~50 nodes rendered at
      // 8-10px, which is below any comfortable reading size — 8px mono labels are
      // legible only if you already know what they say. The floor is now 11px, and
      // the steps above it shifted up to keep the scale's proportions.
      //
      // Roles are unchanged, so a token still means what it meant; only the value
      // moved. Deliberately plain values: a bare `fontSize` string emits only
      // font-size, so these do not drag a line-height along the way Tailwind's own
      // text-xs / text-sm do.
      //
      // Not covered yet: recharts tick/label sizes are JS numbers in SVG props,
      // so they need a chart theme rather than a class token.
      fontSize: {
        '3xs': '11px',      // floor: unit suffixes, chips, table headers, equation numbers
        '2xs': '12px',      // eyebrow / label
        '1xs': '13px',      // helper text, small buttons, log lines
        'body-sm': '14px',  // dense body copy
        'body': '16px',     // body
        'display-sm': '34px', // section headline
        'display-lg': '44px', // workspace title
        'metric-sm': '28px',  // metric value, narrow viewports
        'metric': '34px',     // metric value
      },
      borderRadius: {
        DEFAULT: '8px', sm: '6px', md: '8px', lg: '10px', xl: '14px', '2xl': '18px',
        card: '12px', 'card-lg': '16px', 'card-xl': '20px', pill: '9999px', input: '9px',
        mark: '10px', chip: '9999px', full: '9999px'
      },
      // Pointed at the same custom property `.shell-gutter` uses, so the token and the
      // shell's gutter cannot drift apart.
      maxWidth: { content: 'var(--content-width)', read: '74ch' },
      // A bare `var()` inside `shadow-[...]` is ambiguous, so Tailwind compiles it as
      // a shadow COLOUR and emits no box-shadow at all — the three popover consumers
      // (palette dialog, batch and single chart tooltips) all rendered flat. Naming
      // the token is what lets Tailwind emit the declaration.
      boxShadow: { popover: 'var(--shadow-popover)', card: 'var(--shadow-card)' },
    },
  },
  plugins: [forms, containerQueries],
};
