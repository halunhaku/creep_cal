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
      // The dense instrument type scale. Every value here is exactly what the
      // ad-hoc text-[8px]…text-[15px] it replaces already rendered, so the whole
      // scale can now be moved from one place — which is what the redesign needs,
      // and what raising the 8–9px floor currently costs 80-odd scattered edits.
      //
      // Deliberately plain values: a bare `fontSize` string emits only font-size,
      // so these do not drag a line-height along the way Tailwind's own text-xs /
      // text-sm do. text-[12px] and text-[14px] stay arbitrary for the same
      // reason — mapping them to text-xs/text-sm would add a line-height and
      // change the layout.
      //
      // Not covered yet: recharts tick/label sizes are JS numbers in SVG props,
      // so they need a chart theme rather than a class token.
      fontSize: {
        '4xs': '8px',      // unit suffixes, engine chips, source URLs
        '3xs': '9px',      // micro labels: table headers, EQ numbers, small controls
        '2xs': '10px',     // eyebrow / label
        '1xs': '11px',     // helper text, small buttons, log lines
        'body-sm': '13px', // dense body copy
        'body': '15px',    // default body size, matches body{} in index.css
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
