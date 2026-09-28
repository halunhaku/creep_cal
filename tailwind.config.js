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
      borderRadius: { card: '10px', 'card-lg': '10px', 'card-xl': '12px', pill: '9999px', input: '6px' },
      maxWidth: { content: '1540px', read: '760px' },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};
