import React, { useEffect, useState } from 'react';

export default function Header({ activeMode, onModeChange, onOpenDocs }) {
  const navItems = [
    { id: 'single', label: 'Single Analysis', shortLabel: 'Single' },
    { id: 'batch', label: 'Batch Matrix', shortLabel: 'Batch' },
    { id: 'docs', label: 'Model Docs', shortLabel: 'Docs' },
  ];

  // Track current theme (system/light/dark) for the toggle icon
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' ? (document.body.getAttribute('data-theme') || 'dark') : 'dark'
  );

  useEffect(() => {
    const sync = () => setTheme(document.body.getAttribute('data-theme') || 'dark');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const themeLabel = theme === 'dark' ? 'Switch to light' : theme === 'light' ? 'Switch to dark' : 'Theme: system';
  const themeIcon = theme === 'dark' ? 'light_mode' : theme === 'light' ? 'dark_mode' : 'brightness_auto';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-line backdrop-blur-xl" style={{ background: 'var(--header-bg)' }}>
      <div className="mx-auto flex h-13 max-w-content items-center justify-between gap-4 px-4 md:px-8" style={{ height: 52 }}>
        {/* Brand */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-green focus:px-3 focus:py-1.5 focus:text-[var(--on-green)]">
          Skip to content
        </a>
        <div className="flex min-w-0 items-center gap-3">
          <span className="status-led shrink-0" aria-hidden="true" />
          <span className="font-mono text-sm font-bold tracking-[0.14em] text-primary md:text-base">
            CREEP<span className="text-green">_LAB</span>
          </span>
          <span className="hidden h-4 w-px bg-line md:block" aria-hidden="true" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-faint md:block">
            Concrete Creep Workspace
          </span>
        </div>

        {/* Mode nav — segmented */}
        <nav aria-label="Workspace mode" className="flex items-center gap-1 rounded-md border border-line bg-surface-2 p-0.5">
          {navItems.map((item) => {
            const isActive = activeMode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => item.id === 'docs' ? onOpenDocs() : onModeChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`
                  rounded px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-150
                  ${isActive
                    ? 'bg-green-soft text-green-dark font-bold'
                    : 'text-muted hover:bg-surface-3 hover:text-primary'
                  }
                `}
              >
                <span className="md:hidden">{item.shortLabel}</span>
                <span className="hidden md:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status + theme toggle */}
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-faint sm:inline">Kernels Ready</span>
          <span className="hidden h-1.5 w-1.5 rounded-full bg-green shadow-[0_0_5px_var(--green)] sm:block" aria-hidden="true" />
          <button
            onClick={() => window.toggleTheme?.()}
            aria-label={themeLabel}
            title={themeLabel}
            className="ml-1 flex items-center justify-center rounded border border-line-strong bg-surface-2 p-1.5 text-muted transition-colors duration-150 hover:border-green-border hover:text-primary"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{themeIcon}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
