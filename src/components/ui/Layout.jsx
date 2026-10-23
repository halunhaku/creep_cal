import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import Header from './Header';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SIDEBAR_KEY = 'creep-lab:sidebar';

function readCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export default function Layout({ activeMode, onModeChange, onOpenDocs, children }) {
  const t = useT();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const asideRef = useRef(null);
  const menuButtonRef = useRef(null);

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

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try { window.localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded'); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  /*
   * The drawer is a modal at narrow widths only. While it is open it traps focus,
   * closes on Escape, locks background scrolling and returns focus to the trigger
   * on close. Crossing into the desktop layout closes it, so a resize cannot leave
   * an invisible scrim over the page.
   */
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const aside = asideRef.current;
    const trigger = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (aside?.querySelector('[data-workspace-link][aria-current="page"]') ?? aside?.querySelector(FOCUSABLE))?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = aside?.querySelectorAll(FOCUSABLE);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      const escaped = !aside.contains(current);
      if (event.shiftKey && (current === first || escaped)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (current === last || escaped)) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = (event) => { if (event.matches) setDrawerOpen(false); };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  return (
    <div className="flex min-h-[100dvh] bg-background text-ink font-body">
      <Sidebar
        activeMode={activeMode}
        onModeChange={onModeChange}
        onOpenDocs={onOpenDocs}
        onOpenPalette={() => setPaletteOpen(true)}
        drawerOpen={drawerOpen}
        onCloseDrawer={closeDrawer}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        asideRef={asideRef}
      />
      {drawerOpen && (
        <div
          className="animate-fade-in fixed inset-0 z-40 bg-[#1f1e1c]/35 lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          activeMode={activeMode}
          onOpenDrawer={() => setDrawerOpen(true)}
          drawerOpen={drawerOpen}
          menuButtonRef={menuButtonRef}
        />
        <main id="main-content" data-workspace={activeMode} className="shell-gutter flex-1 py-7 lg:py-10">
          {children}
        </main>
        <footer className="shrink-0 border-t border-line">
          <div className="shell-gutter flex flex-col gap-1.5 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
            <span>{t('footer.summary')}</span>
            <span className="font-mono text-3xs">{t('footer.stack')}</span>
          </div>
        </footer>
      </div>

      {/* Mounted only while open, so each opening starts from a clean query. */}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
