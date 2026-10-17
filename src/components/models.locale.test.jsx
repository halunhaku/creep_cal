import { describe, expect, test } from 'vitest';
import { LOCALES } from '../i18n/locales';
import { pick } from '../i18n/pick';
import { config as aci209 } from './Aci209Calculator';
import { config as mc2010 } from './Mc2010Calculator';
import { config as b4 } from './B4Calculator';
import { config as b4s } from './B4sCalculator';
import { config as gl2000 } from './Gl2000Calculator';
import { config as aashto } from './AashtoCalculator';

/**
 * A model's wording lives in its own config as `{ en, zh }` pairs rather than in the
 * message catalogues (see i18n/pick.js). That keeps a parameter's label next to its
 * range, but it also means the catalogues' parity test cannot see these values — the
 * `zh` half of a pair could be missing, or could still hold the English, and every
 * test in the suite would still pass.
 *
 * So this walks all six configs in both locales. Two rules are worth spelling out:
 *
 *   - a pair must carry both languages for real, because `pick` falls back to
 *     English rather than failing, which would render an English label inside a
 *     Chinese parameter grid with nothing to indicate it;
 *   - the Chinese half must actually contain Han characters. A duplicated English
 *     string is the shape an untranslated label takes, and it looks deliberate.
 *
 * Values that are deliberately the same in both languages are plain strings, not
 * pairs — a cement strength class is `42.5 R` either way — so they are exempt.
 */
const MODELS = [aci209, mc2010, b4, b4s, gl2000, aashto];
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Every pair anywhere in a model config, with the path that found it. */
function pairs(value, path, found = []) {
  if (typeof value === 'string' || value === undefined || value === null) return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => pairs(item, `${path}[${index}]`, found));
    return found;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.includes('en') || keys.includes('zh')) {
      found.push([path, value]);
      return found;
    }
    for (const [key, child] of Object.entries(value)) pairs(child, `${path}.${key}`, found);
  }
  return found;
}

describe('model wording is translated', () => {
  for (const config of MODELS) {
    describe(config.id, () => {
      test('every text value carries both languages', () => {
        const incomplete = [];
        for (const [path, pair] of pairs(config, config.id)) {
          for (const locale of LOCALES) {
            if (typeof pair[locale] !== 'string' || !pair[locale].trim()) {
              incomplete.push(`${path}.${locale}`);
            }
          }
        }
        expect(incomplete).toEqual([]);
      });

      test('the Chinese half is Chinese, not a copy of the English', () => {
        const untranslated = [];
        for (const [path, pair] of pairs(config, config.id)) {
          if (pair.zh === pair.en) untranslated.push(`${path}: "${pair.zh}"`);
          else if (!HAN.test(pair.zh)) untranslated.push(`${path}: "${pair.zh}" has no Chinese`);
        }
        expect(untranslated).toEqual([]);
      });

      test('both languages resolve to a usable string', () => {
        for (const locale of LOCALES) {
          for (const [path, pair] of pairs(config, config.id)) {
            expect(pick(pair, locale), `${path} in ${locale}`).toBe(pair[locale]);
          }
        }
      });

      test('the result label keeps name and unit apart with a middot', () => {
        // CalculatorWrapper splits `resultLabel` on `·` to separate the metric's
        // name from its unit, so a translated name containing one of its own would
        // silently move the split. A label with no `·` at all means the metric is
        // dimensionless — AASHTO's creep coefficient is — so one part is fine.
        if (!config.resultLabel) return;
        for (const locale of LOCALES) {
          const parts = pick(config.resultLabel, locale).split('·');
          expect(parts.length, `${config.id} in ${locale}`).toBeLessThanOrEqual(2);
          for (const part of parts) expect(part.trim(), `${config.id} in ${locale}`).not.toBe('');
        }
      });

      test('every parameter has a label, and numeric ones have a coherent range', () => {
        for (const item of config.paramsConfig) {
          for (const locale of LOCALES) expect(pick(item.label, locale).trim()).not.toBe('');
          // A categorical field (`curingType`, `aggregateType`, …) has options and
          // no bounds; a numeric one has bounds and must not have them inverted.
          if (item.options) {
            expect(item.min, `${item.name} mixes options with a range`).toBeUndefined();
            expect(item.options.length, `${item.name} options`).toBeGreaterThan(0);
          } else {
            expect(item.min, `${item.name} min`).toBeLessThan(item.max);
          }
        }
      });

      test('every option is labelled in both languages', () => {
        for (const item of config.paramsConfig) {
          for (const option of item.options ?? []) {
            for (const locale of LOCALES) {
              expect(pick(option.label, locale).trim(), `${item.name}/${option.value}`).not.toBe('');
            }
          }
        }
      });

      test('every chart series has a name in both languages', () => {
        expect(config.chartLines.length).toBeGreaterThan(0);
        for (const line of config.chartLines) {
          for (const locale of LOCALES) expect(pick(line.name, locale).trim()).not.toBe('');
        }
      });

      test('the kernel-ready line is localized', () => {
        for (const locale of LOCALES) expect(pick(config.readyMessage, locale).trim()).not.toBe('');
      });
    });
  }

  test('a cross-field rule reports itself in both languages', () => {
    // These messages carry a number computed from the parameters, so they are built
    // in the rule rather than stored in a catalogue — which puts them outside the
    // parity test too.
    const cases = [
      [mc2010, { fcm: 40, sigma: 78 }],   // |σ| > 0.6·fcm = 24 MPa
      [gl2000, { t0: 5, tc: 7 }],         // loading before drying started
    ];
    for (const [config, params] of cases) {
      const issue = config.validateInputs(params);
      expect(issue, `${config.id} should have rejected ${JSON.stringify(params)}`).toBeTruthy();
      expect(typeof issue.field).toBe('string');
      for (const locale of LOCALES) expect(pick(issue.message, locale).trim()).not.toBe('');
      expect(pairs(issue.message, `${config.id}.validateInputs`)).toHaveLength(1);
    }
  });

  test('a valid cross-field pair stays silent', () => {
    expect(mc2010.validateInputs({ fcm: 40, sigma: 12 })).toBeNull();
    expect(gl2000.validateInputs({ t0: 28, tc: 7 })).toBeNull();
  });
});
