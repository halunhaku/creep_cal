import React, { useEffect, useState } from 'react';
import KernelStatus from './KernelStatus';

function ThemeIcon({ dark }) {
  return dark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42"/><circle cx="12" cy="12" r="4"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>
  );
}

export default function Header({ activeMode, onModeChange, onOpenDocs, onOpenPalette }) {
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
    <header className="sticky top-0 z-50 border-b border-line bg-surface">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] button-primary">Skip to content</a>
      <div className="mx-auto flex h-12 w-full max-w-content items-center gap-2 px-4 min-[380px]:gap-3 lg:gap-5 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-action font-sans text-sm font-semibold text-[var(--on-action)]">CL</div>
          {/* Two gates instead of one shrinking block: below 600px the mark stands
              alone, from 600px the wordmark fits (it needs 83px), and the tagline
              only appears once it fits too (~220px, from 900px). Previously the
              text shrank to a sliver and then to "CRE…" between those widths. */}
          <div className="hidden min-w-0 leading-none min-[600px]:block">
            <div className="truncate text-body-sm font-bold text-ink">CREEP LAB</div>
            <div className="mt-1 hidden truncate font-mono text-3xs text-faint min-[900px]:block">
              Concrete time-dependent analysis
            </div>
          </div>
        </div>

        <nav aria-label="Workspace" className="flex h-full shrink-0 items-stretch min-[380px]:gap-1">
          {navItems.map((item) => {
            const active = activeMode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => item.id === 'docs' ? onOpenDocs() : onModeChange(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative px-1.5 text-xs font-semibold transition-colors duration-150 min-[380px]:px-2.5 min-[380px]:text-sm md:px-4 ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {item.label}
                {active && <span className="absolute inset-x-1.5 bottom-0 h-0.5 bg-action min-[380px]:inset-x-2.5 md:inset-x-3" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <button
            onClick={onOpenPalette}
            className="touch-target hidden h-12 w-12 shrink-0 items-center justify-center gap-2 border-x border-line bg-surface text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink md:flex lg:w-auto lg:justify-start lg:px-4"
            aria-label="Search commands"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" strokeWidth="1.7" />
              <path d="m16 16 4 4" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="hidden font-mono text-3xs lg:inline">Search</span>
            <kbd className="hidden rounded-none border border-line px-1 font-mono text-3xs text-faint lg:inline">⌘K</kbd>
          </button>
          <KernelStatus workspace={activeMode} />
          <button
            onClick={() => window.toggleTheme?.()}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="touch-target flex h-12 w-12 shrink-0 items-center justify-center border-l border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink [&_svg]:h-[17px] [&_svg]:w-[17px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8]"
          >
            <ThemeIcon dark={theme === 'dark'} />
          </button>
        </div>
      </div>
    </header>
  );
}
