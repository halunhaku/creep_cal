/**
 * The two languages the workspace ships in.
 *
 * The interface used to be bilingual in the other sense: one English string with
 * its Chinese half joined by `·`, plus a `<Lang>` splitter that marked the Chinese
 * runs with `lang="zh-CN"` so a screen reader would not read 中文 with English
 * phonemes. That worked, but it left the reader with both languages whether or not
 * they wanted them, and it gave Chinese no navigation, no buttons and no reference
 * library. A locale is the honest model: one language on screen at a time, and the
 * document says which one it is.
 *
 * Three different codes are needed and they are not interchangeable:
 *   `id`     what the store, the URL and localStorage carry
 *   `html`   what `<html lang>` carries — a bare `zh` is legal but the audience is
 *            simplified Chinese, and `zh-CN` is what the old run-marking used
 *   `intl`   what `Intl.NumberFormat`/`DateTimeFormat` take
 */
export const LOCALES = ['en', 'zh'];

export const DEFAULT_LOCALE = 'en';

export const HTML_LANG = { en: 'en', zh: 'zh-CN' };

export const INTL_LOCALE = { en: 'en-US', zh: 'zh-CN' };

export function isLocale(value) {
  return LOCALES.includes(value);
}

/**
 * The starting locale for a first visit.
 *
 * Only `navigator.languages` is consulted, and only for a Chinese preference:
 * every other language falls back to English, which is the app's base language.
 * Deliberately not persisted here — the caller stores an explicit choice, and a
 * detected default must not overwrite the visitor's own setting on the next visit.
 *
 * @param {string[]} [languages] defaults to the browser's list
 */
export function detectLocale(languages) {
  const list = languages ?? (typeof navigator === 'undefined'
    ? []
    : navigator.languages ?? [navigator.language]);
  for (const tag of list) {
    if (typeof tag === 'string' && tag.toLowerCase().startsWith('zh')) return 'zh';
  }
  return DEFAULT_LOCALE;
}
