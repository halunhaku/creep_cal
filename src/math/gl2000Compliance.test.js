import { describe, expect, test } from 'vitest';
import { gl2000Compliance, gl2000CompliancePoint } from './creepModels';

/**
 * GL2000 creep (compliance) validation, Gardner CJCE [A5]–[A6], SI units.
 *
 * Tier 1 — exact printed numbers (C.4.4 elastic chain, Type I, fcm28 = 32.5,
 * tc = 7, t0 = 14): Ecm28 = 28,014 MPa, Ecmto ≈ 26,371 MPa and J(t0) =
 * 37.92e-6 1/MPa. Tolerances cover only the report's own intermediate
 * rounding (sub-0.02 %).
 *
 * Tier 2 — structural properties of the equations themselves: no creep at or
 * before loading, Φ(tc) = 1 exactly when loading starts with drying, J never
 * below the elastic compliance, drying creep vanishing by design at 96 % RH,
 * monotonic growth with age.
 *
 * Explicitly NOT asserted: full-curve numbers against the C.4 creep table,
 * whose basic-creep column contradicts [A6] (sums instead of products, no
 * drying part, Φ = 0.961 where the example's own tc = 7 requires 0.9318).
 * See docs/benchmark-sources.md for the forensics.
 */
const c44 = { fcm28: 32.5, h: 70, vs: 100, tc: 7, t0: 14, cementType: 'I' };

describe('GL2000 creep compliance', () => {
  test('C.4.4 elastic chain reproduces E and the loading-age compliance', () => {
    const at = gl2000CompliancePoint({ ...c44, t: 14 });
    expect(Math.abs(at.eCm28 - 28014)).toBeLessThan(0.5);
    expect(Math.abs(at.eCmto - 26371)).toBeLessThan(5);
    expect(at.J).toBeCloseTo(37.92e-6, 8);
  });

  test('no creep at or before loading: J is exactly elastic', () => {
    for (const t of [14, 10, 0]) {
      const got = gl2000CompliancePoint({ ...c44, t });
      expect(got.phi28).toBe(0);
      expect(got.J).toBe(1 / got.eCmto);
    }
  });

  test('drying-before-loading factor is 1 exactly when loading starts with drying', () => {
    expect(gl2000CompliancePoint({ ...c44, t: 365 }).phiTc).toBeLessThan(1);
    expect(gl2000CompliancePoint({ ...c44, t0: 7, t: 365 }).phiTc).toBe(1);
  });

  test('drying creep vanishes by design at 96 % RH', () => {
    const at96 = gl2000CompliancePoint({ ...c44, h: 96, t: 365 });
    expect(Math.abs(at96.drying)).toBeLessThan(0.01 * Math.abs(at96.basic));
  });

  test('compliance grows monotonically and never drops below elastic', () => {
    let previous = -Infinity;
    for (let t = 0; t <= 10000; t += 250) {
      const { J, eCmto } = gl2000CompliancePoint({ ...c44, t });
      expect(J).toBeGreaterThanOrEqual(1 / eCmto);
      expect(J).toBeGreaterThanOrEqual(previous);
      previous = J;
    }
  });

  test('the row wrapper coerces spreadsheet strings', () => {
    const fromRow = gl2000Compliance({ fcm28: '32.5', h: '70', vs: '100', tc: '7', t0: '14', t: '365', cementType: 'I' });
    expect(fromRow.J).toBeCloseTo(gl2000CompliancePoint({ ...c44, t: 365 }).J, 12);
  });

  test.each([
    ['unknown cement', { cementType: 'V' }, /cement type/],
    ['strength below scope', { fcm28: 10 }, /16 ≤ fcm28 ≤ 82/],
    ['humidity below scope', { h: 10 }, /20 ≤ h ≤ 100/],
    ['non-positive V/S', { vs: 0 }, /positive volume-surface/],
    ['loading age below 1 day', { t0: 0 }, /t0 ≥ 1/],
    ['loading before drying started', { t0: 3, tc: 7 }, /t0 ≥ tc/],
  ])('%s throws', (_label, override, message) => {
    expect(() => gl2000CompliancePoint({ ...c44, t: 365, ...override })).toThrow(message);
  });
});
