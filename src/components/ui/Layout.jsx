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
    <div className="min-h-[100dvh] bg-background text-ink font-body">
      <Header
        activeMode={activeMode}
        onModeChange={onModeChange}
        onOpenDocs={onOpenDocs}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <main id="main-content" className="mx-auto min-h-[calc(100dvh-49px)] max-w-content px-4 py-8 md:px-8 lg:py-12">
        {children}
      </main>
      <footer className="border-t border-[#393939] bg-[#161616] text-white">
        <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-8 text-sm text-[#c6c6c6] sm:flex-row sm:items-center sm:justify-between md:px-8">
          <span>Concrete creep calculation workspace</span>
          <span className="font-sans text-xs text-[#c6c6c6]">Float64 · Rust WASM · JS reference</span>
        </div>
      </footer>
      {/* Mounted only while open, so each opening starts from a clean query. */}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
