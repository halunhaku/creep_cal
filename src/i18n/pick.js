import { INTL_LOCALE } from './locales';

/**
 * Resolve a `{ en, zh }` value that lives with the data rather than in a catalogue.
 *
 * The interface's own wording goes through `t()` and the message catalogues. A
 * model's wording does not, for two reasons:
 *
 *   - a parameter's label sits next to its calibrated range, its unit and its step,
 *     because those are one fact about one input. Keeping the label in a separate
 *     143-entry catalogue that has to be edited in step with six config files is how
 *     the two drift apart;
 *   - the model config already works this way — `descriptions: { js, rust }` has
 *     been a keyed object since the engines were split.
 *
 * So the rule is: interface wording is a message, model wording is data.
 *
 * @param {{ en: string, zh: string } | string} value
 * @param {string} locale
 * @returns {string}
 */
export function pick(value, locale) {
  if (typeof value === 'string') return value;
  if (!value) return '';
  return value[locale] ?? value.en ?? '';
}

/**
 * Resolve an array of `{ en, zh }` values — a list of bullets or limitations.
 *
 * @param {Array<{ en: string, zh: string } | string>} values
 * @param {string} locale
 * @returns {string[]}
 */
export function pickAll(values, locale) {
  return (values ?? []).map((value) => pick(value, locale));
}

/** The Intl code for a locale, for the few call sites that build their own formatter. */
export function intlLocale(locale) {
  return INTL_LOCALE[locale] ?? INTL_LOCALE.en;
}
