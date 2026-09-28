import React from 'react';
import Header from './Header';

export default function Layout({ activeMode, onModeChange, onOpenDocs, children }) {
  return (
    <div className="min-h-[100dvh] bg-background text-primary font-body">
      <Header activeMode={activeMode} onModeChange={onModeChange} onOpenDocs={onOpenDocs} />
      <main id="main-content" className="mx-auto min-h-[calc(100dvh-65px)] max-w-content px-4 py-6 md:px-7 lg:px-9 lg:py-8">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between md:px-7 lg:px-9">
          <span>Concrete creep calculation workspace</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.09em] text-faint">Float64 · Rust WASM · JS reference</span>
        </div>
      </footer>
    </div>
  );
}
