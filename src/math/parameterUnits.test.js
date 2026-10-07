import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { NO_UNIT, PARAMETER_UNITS, unitFor } from './parameterUnits';

const CALCULATORS = ['Aci209Calculator', 'Mc2010Calculator', 'B4Calculator', 'B4sCalculator', 'Gl2000Calculator'];

/** Every `{ name: 'x', … unit: 'y' }` the calculators declare, read from source. */
function declaredUnits() {
  const declared = new Map();
  for (const name of CALCULATORS) {
    const source = readFileSync(resolve(process.cwd(), `src/components/${name}.jsx`), 'utf8');
    for (const match of source.matchAll(/\{ name: '(\w+)'([^{}]*)\}/g)) {
      const unit = match[2].match(/unit: '([^']*)'/);
      if (unit) declared.set(match[1], unit[1]);
    }
  }
  return declared;
}

/**
 * The reference library's unit column is documentation; the calculators' configs
 * are the contract. If they disagree, the page is teaching the wrong unit — so
 * this reads the calculator sources and compares, rather than trusting that
 * somebody remembered to update both.
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
