/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-soft': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        primary: 'var(--text)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
        green: 'var(--green)',
        'green-dark': 'var(--green-dark)',
        'green-soft': 'var(--green-soft)',
        'green-border': 'var(--green-border)',
        amber: 'var(--amber)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        error: 'var(--error)',
      },
      fontFamily: {
        serif: ['"SF Pro Display"', '"PingFang SC"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
        sans: ['"SF Pro Text"', '"PingFang SC"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
        body: ['"SF Pro Text"', '"PingFang SC"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
        label: ['"SF Pro Text"', '"PingFang SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Menlo"', '"Consolas"', 'monospace'],
      },
      borderRadius: {
        card: '8px',
        'card-lg': '10px',
        'card-xl': '12px',
        pill: '9999px',
        input: '6px',
      },
      boxShadow: {
        'card': '0 1px 0 rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.35)',
        'card-raised': '0 14px 36px rgba(0,0,0,0.5)',
      },
      maxWidth: {
        content: '1280px',
        read: '720px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
