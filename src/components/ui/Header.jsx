import React, { useEffect, useState } from 'react';
import { setLocale } from '../../state/appStore';
import { useLocale, useT } from '../../i18n';
import { HTML_LANG } from '../../i18n/locales';
import KernelStatus from './KernelStatus';

function ThemeIcon({ dark }) {
  return dark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42"/><circle cx="12" cy="12" r="4"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>
  );
}

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
function LanguageSwitch() {
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
      className="touch-target flex h-12 shrink-0 items-center justify-center border-l border-line bg-surface px-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink min-[380px]:px-2.5"
    >
      {t('language.switchLabel')}
    </button>
  );
}

export default function Header({ activeMode, onModeChange, onOpenDocs, onOpenPalette }) {
  const t = useT();
  const [theme, setTheme] = useState(() => typeof document === 'undefined' ? 'light' : document.body.dataset.theme || 'light');
  const navItems = [
    { id: 'single', label: t('nav.single') },
    { id: 'batch', label: t('nav.batch') },
    { id: 'docs', label: t('nav.docs') },
  ];

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.body.dataset.theme || 'light'));
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const themeLabel = theme === 'dark' ? t('theme.toLight') : t('theme.toDark');

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-line bg-surface">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] button-primary">{t('skipToContent')}</a>
      <div className="shell-gutter flex h-12 items-center gap-2 min-[380px]:gap-3 lg:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-action font-sans text-sm font-semibold text-[var(--on-action)]">CL</div>
          {/* Two gates instead of one shrinking block: below 600px the mark stands
              alone, from 600px the wordmark fits (it needs 83px), and the tagline
              only appears once it fits too (~220px, from 900px). Previously the
              text shrank to a sliver and then to "CRE…" between those widths.
              The Chinese wordmark is the same 9 characters, so the gates hold. */}
          <div className="hidden min-w-0 leading-none min-[600px]:block">
            <div className="truncate text-body-sm font-bold text-ink">{t('brand.name')}</div>
            <div className="mt-1 hidden truncate font-mono text-3xs text-faint min-[900px]:block">
              {t('brand.tagline')}
            </div>
          </div>
        </div>

        <nav aria-label={t('nav.label')} className="flex h-full shrink-0 items-stretch min-[380px]:gap-1">
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
            className="touch-target flex h-12 w-12 shrink-0 items-center justify-center gap-2 border-x border-line bg-surface text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:w-auto lg:justify-start lg:px-4"
            aria-label={t('search.label')}
            title={t('search.title')}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" strokeWidth="1.7" />
              <path d="m16 16 4 4" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="hidden font-mono text-3xs lg:inline">{t('search.text')}</span>
            <kbd className="hidden rounded-none border border-line px-1 font-mono text-3xs text-faint lg:inline">⌘K</kbd>
          </button>
          <KernelStatus workspace={activeMode} />
          <LanguageSwitch />
          <button
            onClick={() => window.toggleTheme?.()}
            aria-label={themeLabel}
            title={themeLabel}
            className="touch-target flex h-12 w-12 shrink-0 items-center justify-center border-l border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink [&_svg]:h-[17px] [&_svg]:w-[17px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8]"
          >
            <ThemeIcon dark={theme === 'dark'} />
          </button>
        </div>
      </div>
    </header>
  );
}
