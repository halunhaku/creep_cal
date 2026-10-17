import { describe, expect, test } from 'vitest';
import { flatten } from './index';
import en from './messages/en';
import zh from './messages/zh';

/**
 * The catalogues are the contract between the interface and both languages, and
 * the only thing that keeps `zh` from drifting behind `en` as the interface grows.
 *
 * Two failure modes are worth catching here rather than in a rendered assertion:
 * a key that only exists in English (a reader sees English in the middle of a
 * Chinese page — `translate` falls back rather than showing a raw key, so nothing
 * else would complain), and a key that only exists in Chinese (a leftover from a
 * rename, which is dead weight nobody will notice).
 *
 * Placeholders are compared too: `{count}` in one language and `{total}` in the
 * other renders a sentence with a literal `{total}` in it, and the interpolator
 * deliberately leaves unmatched braces visible, so it survives review.
 */
const english = flatten(en);
const chinese = flatten(zh);

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('the message catalogues', () => {
  test('every English key has a Chinese counterpart', () => {
    const missing = [...english.keys()].filter((key) => !chinese.has(key));
    expect(missing).toEqual([]);
  });

  test('Chinese adds no keys of its own', () => {
    const extra = [...chinese.keys()].filter((key) => !english.has(key));
    expect(extra).toEqual([]);
  });

  test('no message is blank in either language', () => {
    const blank = [];
    for (const catalogue of [['en', english], ['zh', chinese]]) {
      const [locale, leaves] = catalogue;
      for (const [key, text] of leaves) {
        if (!text.trim()) blank.push(`${locale}: ${key}`);
      }
    }
    expect(blank).toEqual([]);
  });

  test('both languages of a message take the same variables', () => {
    const mismatched = [];
    for (const [key, text] of english) {
      const other = chinese.get(key);
      if (other === undefined) continue;
      const [a, b] = [placeholders(text), placeholders(other)];
      if (a.join(',') !== b.join(',')) mismatched.push(`${key}: en {${a}} vs zh {${b}}`);
    }
    expect(mismatched).toEqual([]);
  });

  test('a count-dependent message carries both forms in both languages', () => {
    // `flatten` turns `{ one, other }` into two leaves, so the pair is visible as
    // `…requireAttention.one` / `…requireAttention.other` in each catalogue.
    const forms = new Set();
    for (const key of english.keys()) {
      const suffix = key.slice(key.lastIndexOf('.') + 1);
      if (suffix === 'one' || suffix === 'other') forms.add(key.slice(0, key.lastIndexOf('.')));
    }
    expect(forms.size).toBeGreaterThan(0);
    for (const base of forms) {
      for (const locale of ['en', 'zh']) {
        const leaves = locale === 'en' ? english : chinese;
        expect(leaves.has(`${base}.one`), `${locale} is missing ${base}.one`).toBe(true);
        expect(leaves.has(`${base}.other`), `${locale} is missing ${base}.other`).toBe(true);
      }
    }
  });

  test('the catalogue is actually wired up, not empty', () => {
    expect(english.size).toBeGreaterThan(100);
  });
});
