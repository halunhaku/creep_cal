import { describe, expect, test } from 'vitest';
import { gl2000Shrinkage, gl2000ShrinkagePoint } from './creepModels';

/**
 * ACI 209.2R-08 C.4 shrinkage reproduction (Bažant copy R21.pdf, pp.41–42).
 *
 * Worked inputs (C.4.1–C.4.3): Type I cement (K = 1.000), fcm28 = 32.5 MPa,
 * h = 70 % (recovered independently from the creep humidity factor 1.170 and
 * confirmed by four of the six strain rows), V/S = 100 mm and tc = 7 days
 * (both recovered: they are the unique round values fitting five of the six
 * β(t−tc) rows — see below).
 *
 * The t = 90 row (β = 0.224, ε = 139 µε) is EXCLUDED with proof: with
 * tc = 7 and X = 0.12·V/S² = 1200 fixed by the other five rows, the formula
 * gives β = 0.254 and ε ≈ 158 µε; no non-negative tc fits all six rows
 * together (forcing it drives tc negative). The kernel asserts the
 * formula-consistent 158 so a future transcription slip cannot hide here.
 * Tolerance is ±1 µε throughout: print rounding (±0.5) plus the recovered
 * inputs being round by construction.
 */
const c43 = { fcm28: 32.5, h: 70, vs: 100, tc: 7, cementType: 'I' };

describe('ACI 209.2R-08 C.4 GL2000 shrinkage', () => {
  // ±1 µε: print rounding (±0.5) plus the recovered inputs being round
  // by construction — still an order of magnitude tighter than any
  // formula-level mistake (wrong coefficient: 10 %+, wrong K: 25 %).
  test.each([
    [7, 0],
    [28, -81],
    [60, -128],
    [180, -220],
    [365, -297],
  ])('t = %i days reproduces %i µε', (t, expected) => {
    const got = gl2000ShrinkagePoint({ ...c43, t }).epsilonSH;
    expect(Math.abs(got - expected)).toBeLessThan(1);
  });

  test('the irreconcilable t = 90 row follows the formula, not the print', () => {
    const got = gl2000ShrinkagePoint({ ...c43, t: 90 }).epsilonSH;
    expect(Math.abs(got - -158)).toBeLessThan(1);
  });

  test('no drying yet means no shrinkage, not NaN', () => {
    for (const t of [7, 3]) {
      const got = gl2000ShrinkagePoint({ ...c43, t });
      expect(got).toMatchObject({ epsilonSH: 0, epsilonAU: 0, epsilonTotal: 0 });
      expect(got.betaT).toBe(0);
    }
  });

  test('the row wrapper coerces spreadsheet strings', () => {
    const fromRow = gl2000Shrinkage({ fcm28: '32.5', h: '70', vs: '100', tc: '7', t: '365', cementType: 'I' });
    expect(fromRow.epsilonSH).toBeCloseTo(gl2000ShrinkagePoint({ ...c43, t: 365 }).epsilonSH, 12);
  });

  test.each([
    ['unknown cement', { cementType: 'V' }, /cement type/],
    ['strength below scope', { fcm28: 10 }, /16 ≤ fcm28 ≤ 82/],
    ['strength above scope', { fcm28: 200 }, /16 ≤ fcm28 ≤ 82/],
    ['humidity below scope', { h: 10 }, /20 ≤ h ≤ 100/],
    ['non-positive V/S', { vs: 0 }, /positive volume-surface/],
  ])('%s throws', (_label, override, message) => {
    expect(() => gl2000ShrinkagePoint({ ...c43, t: 365, ...override })).toThrow(message);
  });
});
