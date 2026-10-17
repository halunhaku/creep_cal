import { INTL_LOCALE } from './locales';

/**
 * Numbers and times in the reader's locale.
 *
 * The audit's P2-2: every number in the app was formatted `en-US` explicitly —
 * `Intl.NumberFormat('en-US')` and `toLocaleString('en-US')` — so a Chinese
 * interface still grouped thousands the American way. Grouping happens to be the
 * same in both, which is why it survived this long; the decimal separator and the
 * digit shapes are where they diverge, and neither is the point. The point is that
 * the format was pinned to a locale that is no longer necessarily the document's.
 *
 * Each formatter is cached because `Intl.NumberFormat` construction is expensive
 * and these are called inside render — a batch matrix re-formats every cell on
 * every scroll of the result table.
 */
const numberCache = new Map();
const preciseCache = new Map();
const timeCache = new Map();

/** @param {string} locale */
export function numberFormat(locale) {
  const intl = INTL_LOCALE[locale] ?? INTL_LOCALE.en;
  let formatter = numberCache.get(intl);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intl);
    numberCache.set(intl, formatter);
  }
  return formatter;
}

/** A grouped integer — row counts, day counts, matrix sizes. */
export function formatInteger(value, locale) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return numberFormat(locale).format(Math.round(number));
}

/**
 * A possibly-fractional value at a fixed precision.
 *
 * `digits` is passed through rather than defaulted per locale: the precision here
 * is a modelling decision (how many significant figures the kernel's output
 * warrants), not a presentational one.
 */
export function formatNumber(value, locale, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const intl = INTL_LOCALE[locale] ?? INTL_LOCALE.en;
  const key = digits == null ? `${intl}:auto` : `${intl}:${digits}`;
  let formatter = preciseCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intl, digits == null
      ? { maximumFractionDigits: 6 }
      : { minimumFractionDigits: digits, maximumFractionDigits: digits });
    preciseCache.set(key, formatter);
  }
  return formatter.format(number);
}

/** A clock time for the calculation log's left column. */
export function formatTime(date, locale) {
  const intl = INTL_LOCALE[locale] ?? INTL_LOCALE.en;
  const key = `${intl}:time`;
  let formatter = timeCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    timeCache.set(key, formatter);
  }
  return formatter.format(date);
}
