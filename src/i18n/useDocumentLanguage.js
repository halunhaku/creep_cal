import { useEffect } from 'react';
import { useT, useLocale } from './index';
import { HTML_LANG } from './locales';

/**
 * Make the document claim the language it is actually in.
 *
 * `<html lang="en">` is a static attribute in index.html and it used to be the
 * truth: the interface was English with Chinese fragments, each fragment marked.
 * Once the interface can be Chinese, leaving it at `en` would be a lie about every
 * word on the page — a screen reader would read the whole thing with English
 * phonemes, and the defect the fragment-marking fixed would come back at page scale.
 *
 * Only `<html>` needs this. Nothing inside the page carries a `lang` any more
 * except the one control that deliberately shows the other language (see
 * `ui/Header.jsx`), because that is the only place two languages still meet.
 *
 * The title and the description are updated too: they are what a bookmark, a tab
 * and a search result show, and they were the one part of the interface that stayed
 * English — the static `<meta name="description">` was even Chinese, so the head
 * disagreed with itself.
 */
export function useDocumentLanguage() {
  const locale = useLocale();
  const t = useT();

  useEffect(() => {
    const root = document.documentElement;
    root.lang = HTML_LANG[locale];
    // Tells the search engines and the browser's own translation prompt that the
    // same page exists in the other language.
    document.title = t('document.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('document.description'));
    document.querySelector('meta[property="og:locale"]')?.setAttribute('content', HTML_LANG[locale]);
  }, [locale, t]);
}
