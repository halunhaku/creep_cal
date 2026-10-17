import { describe, expect, test } from 'vitest';
import { NO_UNIT, PARAMETER_UNITS, unitFor } from './parameterUnits';
import { config as aci209 } from '../components/Aci209Calculator';
import { config as mc2010 } from '../components/Mc2010Calculator';
import { config as b4 } from '../components/B4Calculator';
import { config as b4s } from '../components/B4sCalculator';
import { config as gl2000 } from '../components/Gl2000Calculator';
import { config as aashto } from '../components/AashtoCalculator';

const CONFIGS = [aci209, mc2010, b4, b4s, gl2000, aashto];

/** Every parameter unit the calculators declare, read from their real configs. */
function declaredUnits() {
  const declared = new Map();
  for (const config of CONFIGS) {
    for (const item of config.paramsConfig) {
      if (item.unit !== undefined) declared.set(item.name, item.unit);
    }
  }
  return declared;
}

/**
 * The reference library's unit column is documentation; the calculators' configs
 * are the contract. If they disagree, the page is teaching the wrong unit — so
 * this compares the shipped configs against the shipped notes, rather than
 * trusting that somebody remembered to update both.
 *
 * The configs are imported rather than regex-parsed out of the source text: once a
 * parameter's label became a `{ en, zh }` pair, a brace-counting regex silently
 * matched nothing and the test would have passed against an empty map.
 */
describe('parameter units', () => {
  test('every unit the documentation shows matches the calculator contract', () => {
    const declared = declaredUnits();
    expect(declared.size).toBeGreaterThan(20); // the parse found the configs

    const mismatches = [];
    for (const [name, unit] of declared) {
      const documented = PARAMETER_UNITS[name];
      if (documented === undefined) { mismatches.push(`${name}: missing from the documentation`); continue; }
      // The calculators spell some units out ("Days") and leave ratios empty.
      const normalise = (value) => (value || '').toLowerCase().replace(/\s+/g, ' ');
      if (normalise(unit) !== normalise(documented)) {
        mismatches.push(`${name}: calculator says "${unit}", documentation says "${documented}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test('dimensionless and categorical parameters read as a dash, not as blank', () => {
    expect(unitFor('wC')).toBe(NO_UNIT);
    expect(unitFor('cementType')).toBe(NO_UNIT);
    expect(unitFor('Cs')).toBe(NO_UNIT);
  });

  test('a unit is a short symbol, not a sentence', () => {
    for (const [name, unit] of Object.entries(PARAMETER_UNITS)) {
      expect(unit.length, `${name} unit is too long: "${unit}"`).toBeLessThanOrEqual(6);
    }
  });
});
