import { describe, expect, test } from 'vitest';
import { aci209Phi } from './creepModels';

const base = {
  curingType: 'moist',
  t0: 28,
  H: 70,
  VS: 100,
  slump: 100,
  fineAggregate: 50,
  airContent: 8,
};

describe('ACI 209R-92 published formulation', () => {
  test('matches the published correction-factor benchmark', () => {
    expect(aci209Phi({ ...base, t: 365 })).toBeCloseTo(1.1775595568281587, 12);
    expect(aci209Phi({ ...base, t: 10000 })).toBeCloseTo(1.4770871324036734, 12);
  });

  test('recovers the nominal 2.35 ultimate coefficient under standard factors', () => {
    const VS = -Math.log(0.5 / 1.13) / 0.0213;
    const slump = (1 - 0.82) / 0.00264;
    const elapsed = 100;
    const expected = 2.35 * Math.pow(elapsed, 0.6) / (10 + Math.pow(elapsed, 0.6));

    expect(aci209Phi({
      curingType: 'moist',
      t0: 7,
      H: 40,
      VS,
      slump,
      fineAggregate: 50,
      airContent: 0,
      t: 7 + elapsed,
    })).toBeCloseTo(expected, 12);
  });

  test('starts creep at loading and applies official lower bounds', () => {
    expect(aci209Phi({ ...base, t: base.t0 - 1 })).toBe(0);
    expect(aci209Phi({ ...base, t: base.t0 })).toBe(0);

    const lowHumidity = aci209Phi({ ...base, H: 20, t: 365 });
    const thresholdHumidity = aci209Phi({ ...base, H: 40, t: 365 });
    expect(lowHumidity).toBeCloseTo(thresholdHumidity, 12);

    const zeroAir = aci209Phi({ ...base, airContent: 0, t: 365 });
    const sixPercentAir = aci209Phi({ ...base, airContent: 6, t: 365 });
    expect(zeroAir).toBeCloseTo(sixPercentAir, 12);
  });

  test('uses curing-specific loading-age corrections', () => {
    const shared = {
      H: 70,
      VS: 100,
      slump: 100,
      fineAggregate: 50,
      airContent: 8,
    };
    const moist = aci209Phi({ ...shared, curingType: 'moist', t0: 28, t: 365 });
    const steam = aci209Phi({ ...shared, curingType: 'steam', t0: 28, t: 365 });
    expect(steam).not.toBeCloseTo(moist, 6);
    expect(() => aci209Phi({ ...shared, curingType: 'other', t0: 28, t: 365 })).toThrow(RangeError);
  });
});
