import React, { useEffect, useState } from 'react';

function ThemeIcon({ dark }) {
  return dark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42"/><circle cx="12" cy="12" r="4"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>
  );
}

export default function Header({ activeMode, onModeChange, onOpenDocs }) {
  const [theme, setTheme] = useState(() => typeof document === 'undefined' ? 'light' : document.body.dataset.theme || 'light');
  const navItems = [
    { id: 'single', label: 'Calculate' },
    { id: 'batch', label: 'Batch' },
    { id: 'docs', label: 'Reference' },
  ];

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.body.dataset.theme || 'light'));
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line" style={{ background: 'var(--header-bg)', backdropFilter: 'blur(16px)' }}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] button-primary">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-content items-center gap-5 px-4 md:px-7 lg:px-9">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-line-strong bg-surface font-mono text-[10px] font-bold text-green">CL</div>
          <div className="min-w-0 leading-none">
            <div className="truncate text-[14px] font-bold tracking-[0.09em] text-primary">CREEP LAB</div>
            <div className="mt-1 hidden truncate font-mono text-[9px] uppercase tracking-[0.11em] text-faint sm:block">Concrete time-dependent analysis</div>
          </div>
        </div>

        <nav aria-label="Workspace" className="flex h-full items-stretch gap-1">
          {navItems.map((item) => {
            const active = activeMode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => item.id === 'docs' ? onOpenDocs() : onModeChange(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative px-3 text-sm font-semibold transition-colors duration-150 md:px-4 ${active ? 'text-primary' : 'text-muted hover:text-primary'}`}
              >
                {item.label}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-green" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <button className="hidden items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 sm:flex" title="Rust WebAssembly engine ready">
            <span className="status-dot" aria-hidden="true" />
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">WASM ready</span>
          </button>
          <button
            onClick={() => window.toggleTheme?.()}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-primary [&_svg]:h-[17px] [&_svg]:w-[17px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8]"
          >
            <ThemeIcon dark={theme === 'dark'} />
          </button>
        </div>
      </div>
    </header>
  );
}
