import { useCallback } from 'react';
import { useAppSelector } from '../state/appStore';
import { DEFAULT_LOCALE, LOCALES } from './locales';
import { pick } from './pick';

/**
 * Translation lookup.
 *
 * Deliberately not a context: the app already has one store with one consumer per
 * workspace, and the locale has to live there anyway because the URL carries it and
 * `localStorage` persists it. A provider would be a second mechanism for the same
 * fact, and the two would have to be kept in step.
 *
 * Messages are nested objects addressed by a dotted key — `t('header.nav.calculate')`.
 * A value is a string, or an object of `{ one, other }` for a count-dependent
 * message. A value is never a function: a catalogue that can compute cannot be
 * checked, and `messages.parity.test.js` checks every key resolves to a non-empty
 * string in both locales.
 */
import en from './messages/en';
import zh from './messages/zh';

const CATALOGUES = { en, zh };

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isNode(value) {
  return Boolean(value) && typeof value === 'object';
}

/**
 * Walk a dotted key. Returns the raw node, which may still be a `{ one, other }`
 * pair; `select` below decides that, because only it knows the count.
 */
function lookup(catalogue, key) {
  let node = catalogue;
  for (const part of key.split('.')) {
    if (!isNode(node) || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

function select(node, count) {
  if (typeof node === 'string') return node;
  if (isNode(node) && (typeof node.one === 'string' || typeof node.other === 'string')) {
    if (count === undefined) return undefined;
    return Number(count) === 1 ? (node.one ?? node.other) : (node.other ?? node.one);
  }
  return undefined;
}

/**
 * `{name}` interpolation. A placeholder with no matching variable is left as
 * written rather than blanked, so a missing variable shows up as `{count}` on
 * screen and in a failing assertion instead of as a silent gap in a sentence.
 */
function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (
    name in vars && vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : whole
  ));
}

const warned = new Set();

/**
 * @param {string} locale
 * @param {string} key
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function translate(locale, key, vars) {
  const active = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const count = vars && typeof vars.count === 'number' ? vars.count : undefined;

  let text = select(lookup(CATALOGUES[active], key), count);
  if (text === undefined && active !== DEFAULT_LOCALE) {
    // A key present in English but not yet translated renders the English rather
    // than the raw key: a half-finished catalogue degrades to the base language,
    // which a reader can still use.
    text = select(lookup(CATALOGUES[DEFAULT_LOCALE], key), count);
  }
  if (text === undefined) {
    if (import.meta.env?.DEV && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing message: ${key}`);
    }
    return key;
  }
  return interpolate(text, vars);
}

/** The bound `t` for the active locale. @returns {(key: string, vars?: object) => string} */
export function useT() {
  const locale = useAppSelector((state) => state.locale);
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}

/**
 * Resolve `{ en, zh }` values that travel with the data — a model's parameter
 * labels and descriptions. See `pick.js` for why those are not catalogue messages.
 *
 * @returns {(value: { en: string, zh: string } | string) => string}
 */
export function usePick() {
  const locale = useAppSelector((state) => state.locale);
  return useCallback((value) => pick(value, locale), [locale]);
}

/** The active locale alone, for the places that need a formatter rather than a string. */
export function useLocale() {
  return useAppSelector((state) => state.locale);
}

/** Test seam: clear the once-per-key development warning. */
export function resetMissingWarnings() {
  warned.clear();
}

/**
 * Every leaf key in a catalogue, as dotted paths. Used by the parity test, which is
 * what keeps `zh.js` from drifting behind `en.js` as the interface grows.
 *
 * @param {Record<string, unknown>} catalogue
 * @returns {Map<string, string | Record<string, string>>}
 */
export function flatten(catalogue, prefix = '', into = new Map()) {
  for (const [key, value] of Object.entries(catalogue)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') into.set(path, value);
    else if (isNode(value)) flatten(value, path, into);
  }
  return into;
}
