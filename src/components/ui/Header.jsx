import { useT } from '../../i18n';
import KernelStatus from './KernelStatus';

/**
 * The content topbar.
 *
 * Navigation lives in the sidebar; this strip carries only what belongs to the
 * current workspace: the drawer trigger on narrow screens, the workspace name and
 * the kernel indicator. The active workspace is also announced through
 * `aria-current` on the sidebar entry, so the title here is a visual anchor rather
 * than the only source of that information.
 */
export default function Header({ activeMode, onOpenDrawer, drawerOpen, menuButtonRef }) {
  const t = useT();
  const title = t(`nav.${activeMode}`);

  return (
    <header className="topbar sticky top-0 z-40 shrink-0 border-b border-line">
      <div className="shell-gutter flex h-14 items-center gap-3">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] button-primary">{t('skipToContent')}</a>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenDrawer}
          data-action="open-navigation"
          aria-label={t('sidebar.open')}
          aria-controls="app-sidebar"
          aria-expanded={drawerOpen}
          className="icon-button touch-hit -ml-1.5 shrink-0 lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-none stroke-current" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-mark bg-action font-display text-[12px] font-semibold text-[var(--on-action)] lg:hidden">CL</span>
          <span className="truncate font-display text-[17px] font-semibold text-ink">{title}</span>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <KernelStatus workspace={activeMode} />
        </div>
      </div>
    </header>
  );
}
