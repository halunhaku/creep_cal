/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)', surface: 'var(--surface)', 'surface-soft': 'var(--surface-2)', 'surface-3': 'var(--surface-3)',
        ink: 'var(--text)', muted: 'var(--text-muted)', faint: 'var(--text-faint)',
        action: 'var(--action)', 'action-hover': 'var(--action-hover)', 'action-soft': 'var(--action-soft)', 'action-border': 'var(--action-border)',
        reference: 'var(--reference)', 'reference-text': 'var(--reference-text)', 'reference-soft': 'var(--reference-soft)',
        success: 'var(--success)', 'success-soft': 'var(--success-soft)', warning: 'var(--warning)', 'warning-soft': 'var(--warning-soft)',
        line: 'var(--line)', 'line-strong': 'var(--line-strong)', error: 'var(--error)', 'error-soft': 'var(--error-soft)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"PingFang SC"', 'sans-serif'], body: ['"IBM Plex Sans"', '"PingFang SC"', 'sans-serif'],
        label: ['"IBM Plex Sans"', '"PingFang SC"', 'sans-serif'], mono: ['"IBM Plex Sans"', '"PingFang SC"', 'sans-serif'],
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
        'body': '16px',     // IBM body
        'display-sm': '32px', // IBM headline
        'metric-sm': '27px',  // metric value, narrow viewports
        'metric': '32px',     // metric value
      },
      borderRadius: {
        DEFAULT: '0px', sm: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px',
        card: '0px', 'card-lg': '0px', 'card-xl': '0px', pill: '0px', input: '0px',
        mark: '0px', chip: '0px', full: '9999px'
      },
      maxWidth: { content: '1584px', read: '760px' },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};
