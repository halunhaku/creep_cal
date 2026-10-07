import { describe, expect, test } from 'vitest';
import { aashtoPoint, aashtoSingle } from './creepModels';

/**
 * AASHTO LRFD (NCHRP 18-07, FHWA-HRT-05-057 Appendix D) reproduction.
 *
 * Each factor is isolated by a ratio of two kernel runs that differ in ONE
 * input, so the time function and every other factor cancel exactly and the
 * ratio equals the factor ratio — which the FHWA background text states
 * outright (all factors unity at f'ci = 4 KSI, H = 70 %, V/S = 3.5 in).
 * 4 KSI = 27.57904 MPa and 2 KSI = 13.78952 MPa; 3.5 in = 88.9 mm.
 */
const KSI = 6.89476;
const base = { fci: 40, H: 70, vs: 88.9, ti: 28, tc: 7, t: 365 };

describe('AASHTO LRFD calibration anchors', () => {
  test('humidity factor is exactly 1.00 at H = 70 %', () => {
    expect(aashtoPoint({ ...base, H: 70 }).psi / aashtoPoint({ ...base, H: 50 }).psi).toBeCloseTo(1.0 / 1.16, 9);
  });

  test('strength factor is exactly 1 at 4 KSI', () => {
    // ktd also carries f'ci, so at finite ages the ratio mixes both factors;
    // at t = 1e12 both time functions equal 1 to 11 decimals, isolating kf.
    const big = { ...base, t: 1e12 };
    expect(aashtoPoint({ ...big, fci: 4 * KSI }).psi / aashtoPoint({ ...big, fci: 8 * KSI }).psi).toBeCloseTo(1.8, 9);
  });

  test('size factor floors at 1.0 for the 3.5 in calibration member', () => {
    expect(aashtoPoint({ ...base, vs: 3.5 * 25.4 }).psi / aashtoPoint({ ...base, vs: 25.4 }).psi).toBeCloseTo(1 / 1.32, 9);
  });

  test('shrinkage humidity factor is 1.02 at H = 70 %', () => {
    expect(aashtoPoint({ ...base, H: 70 }).epsilonSH / aashtoPoint({ ...base, H: 50 }).epsilonSH).toBeCloseTo(1.02 / 1.3, 9);
  });

  test('drying before 5 days curing scales shrinkage by exactly 1.2', () => {
    // At t = 10000 the time functions agree to 6 decimals, isolating the rule.
    expect(aashtoPoint({ ...base, tc: 3, t: 10000 }).epsilonSH / aashtoPoint({ ...base, tc: 7, t: 10000 }).epsilonSH).toBeCloseTo(1.2, 4);
  });
});

describe('AASHTO LRFD structural properties', () => {
  test('no creep at or before loading, no shrinkage at or before drying', () => {
    expect(aashtoPoint({ ...base, t: 28 }).psi).toBe(0);
    expect(aashtoPoint({ ...base, t: 20 }).psi).toBe(0);
    expect(aashtoPoint({ ...base, t: 7 }).epsilonSH).toBe(0);
  });

  test('creep grows monotonically with age', () => {
    let previous = -Infinity;
    for (let t = 0; t <= 10000; t += 250) {
      const { psi } = aashtoPoint({ ...base, t });
      expect(psi).toBeGreaterThanOrEqual(previous);
      previous = psi;
    }
  });

  test('the row wrapper coerces spreadsheet strings', () => {
    const fromRow = aashtoSingle({ fci: '40', H: '70', vs: '88.9', ti: '28', tc: '7', t: '365' });
    expect(fromRow.psi).toBeCloseTo(aashtoPoint({ ...base, t: 365 }).psi, 12);
  });

  test.each([
    ['strength below scope', { fci: 10 }, /2\.4 ≤ fci ≤ 15/],
    ['strength above scope', { fci: 200 }, /2\.4 ≤ fci ≤ 15/],
    ['humidity out of range', { H: 120 }, /0 ≤ H ≤ 100/],
    ['non-positive V/S', { vs: 0 }, /positive volume-surface/],
    ['loading age below 1 day', { ti: 0 }, /ti ≥ 1/],
  ])('%s throws', (_label, override, message) => {
    expect(() => aashtoPoint({ ...base, t: 365, ...override })).toThrow(message);
  });
});
