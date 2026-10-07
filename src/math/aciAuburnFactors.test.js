import { describe, expect, test } from 'vitest';
import { aci209Phi } from './creepModels';

/**
 * Auburn ALDOT 930-373 Table 6.2 reproduction.
 *
 * Beauchamp et al., "Camber and Prestress Losses in High Performance Concrete
 * Bridge Girders" (ALDOT Report 930-373, open PDF, eng.auburn.edu): Table 6.2
 * "Correction Factors for AASHTO BT-54 at H = 70% Using ACI 209R-92"
 * (report p.80) with inputs from Table 6.3 (report p.80; HPC mix, 8-in. avg
 * slump, 4.2 % avg air) and Table 6.1 (BT-54 geometry, Cu = 2.35,
 * (εsh)u = 780 µε).
 *
 * Strategy: each factor is isolated by a ratio of two kernel runs that differ
 * in ONE input, so the time function, φu and every other factor cancel
 * exactly and the ratio equals the factor ratio — which Auburn printed.
 * Stated report inputs are used verbatim (8 in = 203.2 mm; fine aggregate
 * share (374+695)/(374+695+1822) = 36.98 % from the Table 6.3 mix).
 *
 * Deliberately NOT covered: the Table 6.2 shrinkage column (this app
 * implements the ACI creep-coefficient path only — see the DocsPage ACI
 * limitations) and the V/S factor (BT-54 V/S is not stated in the report;
 * the end-to-end check below discloses the inverted 76.3 mm).
 */
const bt54 = {
  curingType: 'moist', t0: 1, H: 70, VS: 76.3, slump: 203.2,
  fineAggregate: 36.98, airContent: 4.2, t: 365,
};

describe('Auburn ALDOT 930-373 Table 6.2 ACI 209 factors', () => {
  test('humidity factor is exactly 0.801 at H = 70 %', () => {
    // Below 40 % the factor plateaus at 1 by construction on both sides.
    expect(aci209Phi({ ...bt54, H: 30 })).toBe(aci209Phi({ ...bt54, H: 40 }));
    expect(aci209Phi({ ...bt54, H: 70 }) / aci209Phi({ ...bt54, H: 40 })).toBeCloseTo(0.801, 6);
  });

  test('air factor floors at 1.0 for the reported 4.2 %', () => {
    expect(aci209Phi({ ...bt54, airContent: 4.2 })).toBe(aci209Phi({ ...bt54, airContent: 0 }));
    expect(aci209Phi({ ...bt54, airContent: 8 }) / aci209Phi({ ...bt54, airContent: 4.2 })).toBeCloseTo(1.18, 6);
  });

  test('slump factor rounds to the reported 1.36 at the stated 8 in', () => {
    // 1.356448 at 203.2 mm prints as 1.36; a 0.0024 slope would give 1.307.
    expect((aci209Phi({ ...bt54, slump: 203.2 }) / aci209Phi({ ...bt54, slump: 0 })) * 0.82).toBeCloseTo(1.36, 2);
  });

  test('fine-aggregate factor rounds to the reported 0.969 at the Table 6.3 mix share', () => {
    expect((aci209Phi({ ...bt54, fineAggregate: 36.98 }) / aci209Phi({ ...bt54, fineAggregate: 0 })) * 0.88).toBeCloseTo(0.969, 2);
  });

  test('loading-age factor is 1 for the early-release girder', () => {
    // Same 364-day load duration from t0 = 1 and t0 = 7: moist curing plateaus.
    expect(aci209Phi({ ...bt54, t0: 1, t: 365 })).toBe(aci209Phi({ ...bt54, t0: 7, t: 371 }));
  });

  test('ultimate creep matches the reported product within print rounding', () => {
    // 2.35 · 0.801 · 0.815 · 1.36 · 0.969 · 1.0 = 2.0217 from Auburn's printed
    // factors. The kernel side divides out its own time function at t = 10000
    // (same dt both sides, so only the factor product is compared); V/S is
    // the one unstated input, inverted as 76.3 mm from the printed 0.815.
    const dt = 10000 - bt54.t0;
    const timeFactor = Math.pow(dt, 0.6) / (10 + Math.pow(dt, 0.6));
    const ultimate = aci209Phi({ ...bt54, t: 10000 }) / timeFactor;
    expect(Math.abs(ultimate - 2.0217) / 2.0217).toBeLessThan(0.005);
  });
});
