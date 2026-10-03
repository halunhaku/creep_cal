/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)', surface: 'var(--surface)', 'surface-soft': 'var(--surface-2)', 'surface-3': 'var(--surface-3)',
        primary: 'var(--text)', muted: 'var(--text-muted)', faint: 'var(--text-faint)', green: 'var(--primary)',
        'green-dark': 'var(--primary)', 'green-soft': 'var(--primary-soft)', 'green-border': 'var(--primary-border)',
        amber: 'var(--accent)', cyan: 'var(--cyan)', line: 'var(--line)', 'line-strong': 'var(--line-strong)', error: 'var(--error)',
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', '"PingFang SC"', 'sans-serif'], body: ['"Hanken Grotesk"', '"PingFang SC"', 'sans-serif'],
        label: ['"Hanken Grotesk"', '"PingFang SC"', 'sans-serif'], mono: ['"Azeret Mono"', '"SFMono-Regular"', 'monospace'],
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
        'body': '15px',     // default body size, matches body{} in index.css
        'display-sm': '28px', // page headings
        'metric-sm': '27px',  // metric value, narrow viewports
        'metric': '32px',     // metric value
      },
      borderRadius: {
        card: '10px', 'card-lg': '10px', 'card-xl': '12px', pill: '9999px', input: '6px',
        mark: '7px', // brand mark in the header
        chip: '4px', // segmented control
      },
      maxWidth: { content: '1540px', read: '760px' },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};
