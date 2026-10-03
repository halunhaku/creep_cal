import React, { useEffect, useState } from 'react';
import Header from './Header';
import CommandPalette from './CommandPalette';

export default function Layout({ activeMode, onModeChange, onOpenDocs, children }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Registered here rather than inside the palette, so the shortcut works before
  // the palette has ever been opened.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-primary font-body">
      <Header
        activeMode={activeMode}
        onModeChange={onModeChange}
        onOpenDocs={onOpenDocs}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <main id="main-content" className="mx-auto min-h-[calc(100dvh-65px)] max-w-content px-4 py-6 md:px-7 lg:px-9 lg:py-8">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between md:px-7 lg:px-9">
          <span>Concrete creep calculation workspace</span>
          <span className="font-mono text-3xs uppercase tracking-[0.09em] text-faint">Float64 · Rust WASM · JS reference</span>
        </div>
      </footer>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
