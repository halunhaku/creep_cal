import { useEffect, useState } from 'react';
import { setLocale } from '../../state/appStore';
import { useLocale, useT } from '../../i18n';
import { HTML_LANG } from '../../i18n/locales';

function ThemeIcon({ dark }) {
  return dark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42"/><circle cx="12" cy="12" r="4"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>
  );
}

const ICONS = {
  single: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 fill-none stroke-current" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="3" strokeWidth="1.6" />
      <path d="M8 8h8M8 12h3M14 12h2M8 16h8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  batch: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 fill-none stroke-current" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="3" strokeWidth="1.6" />
      <path d="M3.5 9h17M9.5 9v11M15 9v11" strokeWidth="1.4" />
    </svg>
  ),
  docs: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 fill-none stroke-current" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5Z" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
};

/**
 * The language switch.
 *
 * It names the language it will switch *to*, written in that language, which is the
 * convention a reader can act on without reading the current interface's language:
 * someone who has landed in English by mistake looks for 中文, not for "Chinese".
 *
 * That text is the one place in the app that is deliberately in the other language,
 * so it carries its own `lang`. Without it a screen reader reads 中文 with English
 * phonemes — which is exactly the defect the earlier bilingual interface had to
 * patch with the `<Lang>` splitter, and it does not stop applying just because the
 * rest of the page is now single-language.
 */
function LanguageSwitch({ collapsed }) {
  const t = useT();
  const locale = useLocale();
  const target = locale === 'en' ? 'zh' : 'en';

  return (
    <button
      type="button"
      onClick={() => setLocale(target)}
      lang={HTML_LANG[target]}
      aria-label={t('language.switchTitle')}
      title={t('language.switchTitle')}
      className={`nav-item touch-hit ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 fill-none stroke-current" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" strokeWidth="1.6" />
        <path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.3 3.3 8.5S14.2 18.2 12 20.5C9.8 18.2 8.7 15.2 8.7 12S9.8 5.8 12 3.5Z" strokeWidth="1.4" />
      </svg>
      <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{t('language.switchLabel')}</span>
    </button>
  );
}

function ThemeToggle({ collapsed, theme, label, text }) {
  return (
    <button
      type="button"
      onClick={() => window.toggleTheme?.()}
      aria-label={label}
      title={label}
      className={`nav-item touch-hit ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
    >
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7]">
        <ThemeIcon dark={theme === 'dark'} />
      </span>
      <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{text}</span>
    </button>
  );
}

/**
 * The shell's primary navigation.
 *
 * Desktop: a column that can collapse to an icon rail; the choice is remembered.
 * Mobile: the same column, slid in over a scrim, closed by the scrim, Escape or a
 * destination. Focus containment and scroll locking live in Layout, which owns
 * both this state and the trigger.
 */
export default function Sidebar({
  activeMode,
  onModeChange,
  onOpenDocs,
  onOpenPalette,
  drawerOpen,
  onCloseDrawer,
  collapsed,
  onToggleCollapsed,
  asideRef,
}) {
  const t = useT();
  const [theme, setTheme] = useState(() => typeof document === 'undefined' ? 'light' : document.body.dataset.theme || 'light');

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.body.dataset.theme || 'light'));
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const themeLabel = theme === 'dark' ? t('theme.toLight') : t('theme.toDark');
  const themeText = theme === 'dark' ? t('theme.light') : t('theme.dark');
  const navItems = [
    { id: 'single', label: t('nav.single') },
    { id: 'batch', label: t('nav.batch') },
    { id: 'docs', label: t('nav.docs') },
  ];

  const go = (item) => {
    if (item.id === 'docs') onOpenDocs();
    else onModeChange(item.id);
    onCloseDrawer();
  };

  const labelHidden = collapsed ? 'lg:hidden' : '';

  return (
    <aside
      ref={asideRef}
      id="app-sidebar"
      aria-label={t('sidebar.label')}
      data-sidebar={collapsed ? 'collapsed' : 'expanded'}
      data-drawer={drawerOpen ? 'open' : 'closed'}
      className={`sidebar-surface fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[320px] flex-col border-r border-sidebar-line transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:z-30 lg:h-[100dvh] lg:max-w-none lg:translate-x-0 ${drawerOpen ? 'translate-x-0 shadow-popover lg:shadow-none' : '-translate-x-full'} ${collapsed ? 'lg:w-[var(--sidebar-w-collapsed)]' : 'lg:w-[var(--sidebar-w)]'}`}
    >
      <div className={`flex h-14 shrink-0 items-center gap-3 px-4 lg:h-16 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-mark bg-action font-display text-[15px] font-semibold text-[var(--on-action)]">CL</span>
        <div className={`min-w-0 leading-tight ${collapsed ? 'lg:hidden' : ''}`}>
          <div className="truncate text-body-sm font-semibold text-ink">{t('brand.name')}</div>
          <div className="mt-0.5 hidden truncate text-3xs text-faint lg:block">{t('brand.tagline')}</div>
        </div>
        <button
          type="button"
          onClick={onCloseDrawer}
          aria-label={t('sidebar.close')}
          className="icon-button touch-target ml-auto shrink-0 lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="px-2.5 pb-2">
        <button
          type="button"
          onClick={onOpenPalette}
          data-action="open-palette"
          aria-label={t('search.label')}
          title={t('search.title')}
          className={`nav-item touch-hit border border-sidebar-line bg-surface hover:bg-[var(--sidebar-hover)] ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
        >
          <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] shrink-0 fill-none stroke-current" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" strokeWidth="1.7" />
            <path d="m16 16 4 4" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className={`truncate ${labelHidden}`}>{t('search.text')}</span>
          <kbd className={`ml-auto rounded-sm border border-line px-1.5 py-0.5 font-mono text-3xs text-faint ${labelHidden}`}>⌘K</kbd>
        </button>
      </div>

      <nav aria-label={t('nav.label')} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = activeMode === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(item)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  title={collapsed ? item.label : undefined}
                  data-workspace-link={item.id}
                  className={`nav-item touch-hit ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
                >
                  {ICONS[item.id]}
                  <span className={`truncate ${labelHidden}`}>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={`space-y-1 border-t border-sidebar-line px-2.5 py-3 ${collapsed ? 'lg:px-2' : ''}`}>
        <LanguageSwitch collapsed={collapsed} />
        <ThemeToggle collapsed={collapsed} theme={theme} label={themeLabel} text={themeText} />
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          data-action="toggle-sidebar"
          className={`nav-item touch-hit hidden lg:flex ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
        >
          <svg viewBox="0 0 24 24" className={`h-[18px] w-[18px] shrink-0 fill-none stroke-current transition-transform ${collapsed ? 'rotate-180' : ''}`} aria-hidden="true">
            <path d="m14 6-6 6 6 6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19 5v14" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className={`truncate ${labelHidden}`}>{t('sidebar.collapse')}</span>
        </button>
      </div>
    </aside>
  );
}
