import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setModel, useAppSelector } from '../state/appStore';
import { useLocale, useT } from '../i18n';
import { pick } from '../i18n/pick';
import { DOCUMENTS, documentUrl } from '../docs/documents';
import { loadDocument } from '../docs/loadDocument';
import MarkdownDocument from '../docs/MarkdownDocument';

const READING_LINE = 112; // fixed header plus the headings' scroll margin

export default function DocsPage() {
  const selected = useAppSelector((state) => state.model);
  const locale = useLocale();
  const t = useT();
  const model = DOCUMENTS.find((item) => item.id === selected) ?? DOCUMENTS[0];
  const key = `${model.id}:${locale}`;
  const [record, setRecord] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const content = record?.key === key ? record.document : null;
  const failed = record?.key === key && record.error;
  const article = useRef(null);
  const position = useRef(null);
  const previous = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    loadDocument(model.id, locale, controller.signal).then((document) => {
      if (active) setRecord({ key, document });
    }).catch((error) => {
      if (active && error.name !== 'AbortError') setRecord({ key, error: true });
    });
    return () => { active = false; controller.abort(); };
  }, [key, model.id, locale, attempt]);

  useEffect(() => {
    const remember = () => {
      // Ignore loading layouts: collapsing the old translation must not replace
      // the saved logical position with an unrelated heading or an empty page.
      if (article.current?.dataset.documentKey !== key) return;
      const headings = [...article.current.querySelectorAll('[data-doc-heading]')];
      if (!headings.length) return;
      const current = headings.findLast((heading) => heading.getBoundingClientRect().top <= READING_LINE) ?? headings[0];
      position.current = { modelId: model.id, id: current.id, offset: current.getBoundingClientRect().top - READING_LINE };
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [key, model.id]);

  useLayoutEffect(() => {
    if (!content) return;
    const prior = previous.current;
    const saved = position.current;
    const changingLanguage = prior?.modelId === model.id && prior.locale !== locale;
    const hash = window.location.hash.slice(1);
    const id = changingLanguage && saved?.modelId === model.id ? saved.id : hash;
    const heading = content.parsed.headings.some((entry) => entry.id === id)
      ? article.current?.querySelector(`#${id}`) : null;
    if (heading) {
      heading.scrollIntoView({ block: 'start', behavior: 'instant' });
      if (changingLanguage && saved?.offset) window.scrollBy({ top: -saved.offset, behavior: 'instant' });
    }
    previous.current = { modelId: model.id, locale };
  }, [content, model.id, locale]);

  const rememberAnchor = (id) => {
    if (content?.parsed.headings.some((entry) => entry.id === id)) {
      position.current = { modelId: model.id, id, offset: 0 };
    }
  };

  return (
    <div className="animate-fade-in">
      <header className="workspace-header">
        <div className="eyebrow">{t('docs.workspace')}</div>
        <h1 className="mt-1.5 text-2xl font-light text-ink md:text-display-sm">{t('docs.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('docs.description')}</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)] 2xl:grid-cols-[210px_minmax(0,1fr)_180px]">
        <aside className="workbench-panel overflow-hidden lg:sticky lg:top-[88px] lg:row-span-2 2xl:row-span-1">
          <div className="border-b border-line px-4 py-3"><div className="eyebrow">{t('docs.models')}</div></div>
          <nav className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-1" aria-label={t('docs.modelNavigation')}>
            {DOCUMENTS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setModel(item.id)}
                aria-pressed={item.id === model.id}
                className={`relative min-w-[180px] rounded-none px-3 py-3 text-left lg:w-full lg:min-w-0 ${item.id === model.id ? 'bg-action-soft text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
              >
                {item.id === model.id && <span className="absolute bottom-2 left-0 top-2 w-[3px] bg-action" />}
                <span className="flex gap-2">
                  <span className="font-mono text-3xs text-faint">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-2xs font-semibold">{item.name}</span>
                </span>
                <span className="mt-1 block pl-5 font-mono text-3xs text-faint">{pick(item.category, locale)}</span>
              </button>
            ))}
          </nav>
        </aside>

        <aside className="workbench-panel min-w-0 p-4 lg:col-start-2 2xl:col-start-3 2xl:row-start-1 2xl:sticky 2xl:top-[88px]">
          <div className="eyebrow">{t('docs.contents')}</div>
          <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2 2xl:block 2xl:max-h-[75vh] 2xl:overflow-y-auto 2xl:border-l 2xl:border-line" aria-label={t('docs.sectionNavigation')} aria-busy={!content && !failed}>
            {content?.parsed.headings.map((heading) => (
              <a key={heading.id} href={`#${heading.id}`} onClick={() => rememberAnchor(heading.id)} className={`block py-1 text-xs text-muted hover:text-action 2xl:border-l 2xl:border-transparent 2xl:py-1.5 2xl:hover:border-action ${heading.depth > 2 ? '2xl:pl-6 2xl:pr-2' : '2xl:px-3'}`}>
                {heading.label}
              </a>
            ))}
          </nav>
        </aside>

        <article ref={article} aria-busy={!content && !failed} data-document-key={content ? key : undefined} className="min-w-0 workbench-panel overflow-hidden lg:col-start-2 2xl:row-start-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-7">
            <span className="eyebrow">{pick(model.category, locale)}</span>
            <a href={documentUrl(model.id, locale)} download={`${model.id}.${locale}.md`} className="button-secondary !min-h-8 !px-2.5 !text-3xs">{t('docs.download')}</a>
          </div>
          <div className="p-5 md:p-7">
            {content ? <MarkdownDocument document={content.parsed} headingOffset={1} onNavigate={rememberAnchor} /> : failed ? (
              <div role="alert" className="py-8 text-sm text-error">
                <p>{t('docs.loadError')}</p>
                <button type="button" className="button-secondary mt-4" onClick={() => { setRecord(null); setAttempt((value) => value + 1); }}>{t('docs.retry')}</button>
              </div>
            ) : <p role="status" className="py-8 text-sm text-muted">{t('docs.loading')}</p>}
          </div>
        </article>
      </div>
    </div>
  );
}
