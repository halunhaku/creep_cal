import React from 'react';

export default function Header({ activeMode, onModeChange, onOpenDocs }) {
  const navItems = [
    { id: 'single', label: 'Single analysis', shortLabel: 'Single', icon: 'science' },
    { id: 'batch', label: 'Batch matrix', shortLabel: 'Batch', icon: 'layers' },
    { id: 'docs', label: 'Model docs', shortLabel: 'Docs', icon: 'menu_book' },
  ];

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-32px)] max-w-content">
      <nav className="flex items-center justify-between px-3 py-2 rounded-full bg-white/85 backdrop-blur-xl border border-line shadow-sm">
        {/* Left: Brand */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-green focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <div className="flex items-center gap-3 pl-2">
          <span className="font-sans text-base font-bold tracking-tight text-primary md:text-lg">
            CREEP LAB
          </span>
          <span className="hidden h-4 w-px bg-line md:block" />
          <span className="hidden items-center gap-1.5 text-[10px] font-label uppercase tracking-[0.16em] text-green-dark md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden="true" />
            Local compute
          </span>
        </div>

        {/* Center: Navigation pills */}
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = activeMode === item.id;
            return (
            <button
              key={item.id}
              onClick={() => item.id === 'docs' ? onOpenDocs() : onModeChange(item.id)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-label border border-transparent transition-all duration-200
                md:px-4 md:py-2 md:text-sm
                ${isActive
                  ? 'active-pill min-w-20 justify-center sm:min-w-0'
                  : 'text-muted hover:bg-green-soft/60 hover:text-primary hover:border-green-border/50'
                }
              `}
            >
              <span className="material-symbols-outlined text-[16px] md:text-[18px]" aria-hidden="true">{item.icon}</span>
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          )})}
        </div>

        {/* Right: Theme toggle */}
        <div className="pr-1">
          <button
            onClick={() => window.toggleTheme?.()}
            aria-label="Toggle theme"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-label text-muted border border-transparent hover:bg-green-soft/60 hover:text-primary hover:border-green-border/50 transition-all duration-200"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">dark_mode</span>
            <span className="hidden md:inline text-[10px] uppercase tracking-wider">Theme</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
