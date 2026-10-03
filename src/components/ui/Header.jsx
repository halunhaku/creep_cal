import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { getKernelStatus, subscribeKernelStatus } from '../../wasm/creepEngine';

function ThemeIcon({ dark }) {
  return dark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42"/><circle cx="12" cy="12" r="4"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>
  );
}

export default function Header({ activeMode, onModeChange, onOpenDocs, onOpenPalette }) {
  const [theme, setTheme] = useState(() => typeof document === 'undefined' ? 'light' : document.body.dataset.theme || 'light');
  const kernel = useSyncExternalStore(subscribeKernelStatus, getKernelStatus);
  const kernelBadge = kernel.failure
    ? {
      label: 'WASM unavailable',
      warn: true,
      title: `Rust kernel failed: ${kernel.failure} — the JavaScript reference kernel is in use.`,
    }
    : {
      idle: { label: 'Kernel idle', title: 'No calculation has run in this session yet.' },
      loading: { label: 'Loading WASM…', title: 'Loading the Rust WebAssembly kernel.' },
      ready: kernel.engine === 'rust'
        ? { label: 'WASM ready', title: 'The Rust WebAssembly kernel is loaded and active for the calculation workspace. The batch pipeline computes with the JavaScript reference kernels.' }
        : { label: 'JS kernel ready', title: 'The JavaScript reference kernel is active.' },
      failed: { label: 'WASM unavailable', warn: true, title: 'The Rust kernel failed to load.' },
    }[kernel.state] ?? { label: 'Kernel idle', title: '' };
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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-mark border border-line-strong bg-surface font-mono text-2xs font-bold text-green">CL</div>
          {/* Two gates instead of one shrinking block: below 600px the mark stands
              alone, from 600px the wordmark fits (it needs 83px), and the tagline
              only appears once it fits too (~220px, from 900px). Previously the
              text shrank to a sliver and then to "CRE…" between those widths. */}
          <div className="hidden min-w-0 leading-none min-[600px]:block">
            <div className="truncate text-body-sm font-bold tracking-[0.09em] text-primary">CREEP LAB</div>
            <div className="mt-1 hidden truncate font-mono text-3xs uppercase tracking-[0.11em] text-faint min-[900px]:block">
              Concrete time-dependent analysis
            </div>
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
          <button
            onClick={onOpenPalette}
            className="hidden items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-primary md:flex"
            aria-label="Search commands"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" strokeWidth="1.7" />
              <path d="m16 16 4 4" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="font-mono text-3xs uppercase tracking-[0.08em]">Search</span>
            <kbd className="rounded border border-line px-1 font-mono text-3xs text-faint">⌘K</kbd>
          </button>
          <div
            className="hidden items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 sm:flex"
            title={kernelBadge.title}
            role="status"
            aria-live="polite"
          >
            <span className="status-dot" aria-hidden="true" style={kernelBadge.warn ? { background: 'var(--warning)' } : undefined} />
            <span className={`font-mono text-3xs font-semibold uppercase tracking-[0.1em] ${kernelBadge.warn ? 'text-[var(--warning)]' : 'text-muted'}`}>
              {kernelBadge.label}
            </span>
          </div>
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
