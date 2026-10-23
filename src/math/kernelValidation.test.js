import { describe, expect, test } from 'vitest';
import { aci209Phi, aci209Single, b4Point, b4Single, b4sPoint, b4sSingle, mc2010Point, mc2010Single } from './creepModels';

const aciBase = {
  curingType: 'moist', t0: 28, H: 70, VS: 100,
  slump: 100, fineAggregate: 50, airContent: 8, t: 365,
};

const b4Base = {
  t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 27.6, vS: 19.05,
  c: 219.3, wC: 0.6, aC: 7, cementType: 'R', aggregateType: 'No Information',
  specimenShape: '1', retarder: 0, flyAsh: 0, superplasticizer: 0, silicaFume: 0,
  airEntrainingAgent: 0, waterReducer: 0, t: 112,
};

const mc2010Base = {
  fcm: 40, RH: 70, t0: 28, Ac: 90000, u: 1200, T: 20, Cs: '42.5 R', sigma: 12, t: 365,
};

describe('ACI 209R-92 rejects out-of-domain input', () => {
  // Regression: aci209Phi had no range validation at all, so H = 500 % returned
  // phi = -3.0578 (a negative creep coefficient) and the batch pipeline marked the
  // row "valid". The other three kernels already validated.
  test.each([
    ['H above 100 %', { H: 500 }, /0 ≤ H ≤ 100/],
    ['H below 0 %', { H: -1 }, /0 ≤ H ≤ 100/],
    ['H not a number', { H: 'abc' }, /0 ≤ H ≤ 100/],
    ['H empty cell', { H: '' }, /0 ≤ H ≤ 100/],
    ['V/S not positive', { VS: -50 }, /positive volume-surface/],
    ['V/S zero', { VS: 0 }, /positive volume-surface/],
    ['negative slump', { slump: -1000 }, /non-negative slump/],
    ['fine aggregate above 100 %', { fineAggregate: 150 }, /fine aggregate/],
    ['negative air content', { airContent: -20 }, /non-negative air content/],
    ['t0 below 1 day', { t0: 0 }, /t0 ≥ 1 day/],
    ['negative age', { t: -5 }, /non-negative finite concrete age/],
    ['infinite age', { t: Infinity }, /non-negative finite concrete age/],
  ])('%s throws', (_label, override, message) => {
    expect(() => aci209Phi({ ...aciBase, ...override })).toThrow(message);
    expect(() => aci209Single({ ...aciBase, ...override })).toThrow(message);
  });

  test('the UI-declared boundaries are accepted', () => {
    expect(() => aci209Phi({ ...aciBase, H: 0, VS: 1, slump: 0, fineAggregate: 0, airContent: 0, t0: 1, t: 0 })).not.toThrow();
    expect(() => aci209Phi({ ...aciBase, H: 100, VS: 1000, slump: 300, fineAggregate: 100, airContent: 20, t0: 365, t: 10000 })).not.toThrow();
    expect(() => aci209Phi({ ...aciBase, curingType: 'steam', t0: 1 })).not.toThrow();
  });

  test('in-range results are unchanged', () => {
    expect(aci209Phi(aciBase)).toBeCloseTo(1.1775595568281587, 12);
    expect(aci209Phi({ ...aciBase, t: 10000 })).toBeCloseTo(1.4770871324036734, 12);
  });

  test('all four kernels now reject the same class of nonsense', () => {
    const probes = [
      () => aci209Single({ ...aciBase, H: 500 }),
      () => mc2010Single({ ...mc2010Base, RH: 500 }),
      () => b4Single({ ...b4Base, h: 500 }),
      () => b4sSingle({ t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 200, vS: 19.05, cementType: 'R', aggregateType: 'No Information', specimenShape: '1', t: 112 }),
    ];
    for (const probe of probes) expect(probe).toThrow(RangeError);
  });
});

describe('a spreadsheet cell has to be one number', () => {
  /*
   * Regression: the four row adapters disagreed about what a cell means. ACI and
   * MC2010 used `parseFloat` — '1,200' became 1 day, '38,5' became 38 MPa, '365
   * days' was accepted — and B4/B4s used `Number`, which turns '' and ' ' into 0
   * (the extreme end of the humidity range), true into 1 and '0x10' into 16. The
   * matrix displayed the cell the user typed and computed a different number, and
   * the row was counted as Valid.
   */
  const notNumbers = [
    ['blank', ''],
    ['whitespace', '   '],
    ['thousands separator', '1,200'],
    ['decimal comma', '38,5'],
    ['unit suffix', '365 days'],
    ['percent sign', '50%'],
    ['hexadecimal', '0x10'],
    ['boolean', true],
    ['null', null],
  ];

  test.each(notNumbers)('%s is rejected by every adapter', (_label, value) => {
    expect(() => aci209Single({ ...aciBase, H: value })).toThrow(/0 ≤ H ≤ 100/);
    expect(() => mc2010Single({ ...mc2010Base, RH: value })).toThrow(/40 ≤ RH ≤ 100/);
    expect(() => b4Single({ ...b4Base, h: value })).toThrow(/relative humidity/);
    expect(() => b4sSingle({ ...b4Base, h: value })).toThrow(/relative humidity/);
  });

  test('a blank age is reported instead of being computed as day zero', () => {
    expect(() => aci209Single({ ...aciBase, t: '' })).toThrow(/concrete age/);
    expect(() => mc2010Single({ ...mc2010Base, t: ' ' })).toThrow(/concrete age/);
    expect(() => b4Single({ ...b4Base, t: '' })).toThrow(/concrete age/);
    expect(() => b4sSingle({ ...b4Base, t: '' })).toThrow(/concrete age/);
  });

  test('a blank admixture dosage is reported rather than dosed at zero', () => {
    expect(() => b4Single({ ...b4Base, flyAsh: '' })).toThrow(/flyAsh/);
    expect(() => b4Single({ ...b4Base, retarder: ' ' })).toThrow(/retarder/);
  });

  test('a number written as a string still computes — the shipped XLSX cells are text', () => {
    expect(aci209Single({ ...aciBase, H: '70', t: '365' })).toBeCloseTo(aci209Phi(aciBase), 12);
    expect(b4Single({ ...b4Base, h: '50', t: '112' }).J).toBeCloseTo(b4Point(b4Base).J, 12);
    expect(mc2010Single({ ...mc2010Base, RH: '70', t: '365' }).phi).toBeCloseTo(mc2010Point(mc2010Base).phi, 12);
  });

  test('MC2010 refuses a notional size that underflows instead of returning Infinity', () => {
    expect(() => mc2010Point({ ...mc2010Base, Ac: 1e-300, u: 1e300 })).toThrow(/notional size/);
  });

  test('MC2010 rejects a negative concrete age like every other kernel', () => {
    expect(() => mc2010Point({ ...mc2010Base, t: -5 })).toThrow(/non-negative finite concrete age/);
    expect(() => mc2010Single({ ...mc2010Base, t: '-5' })).toThrow(/non-negative finite concrete age/);
  });
});

describe('B4 humidity is a percentage, not a 0–1 fraction', () => {  // Regression: `normalizeB4Humidity` treated any value <= 1 as a fraction, so
  // typing "1" in a field labelled "%" computed 100 % RH.
  test('h = 1 means 1 % RH, not 100 % RH', () => {
    const onePercent = b4Single({ ...b4Base, h: 1 });
    const twoPercent = b4Single({ ...b4Base, h: 2 });
    const fiftyPercent = b4Single({ ...b4Base, h: 50 });
    // 1 % must behave like 2 %, and nowhere near 50 % — the old
    // `value > 1 ? value / 100 : value` branch treated 1 and 0.5 as fractions.
    expect(Math.abs(onePercent.epsilonSH / twoPercent.epsilonSH - 1)).toBeLessThan(1e-4);
    expect(Math.abs(onePercent.epsilonSH / fiftyPercent.epsilonSH - 1)).toBeGreaterThan(0.1);
    // Drying shrinkage magnitude must grow as the section gets drier.
    expect(Math.abs(onePercent.epsilonSH)).toBeGreaterThan(Math.abs(fiftyPercent.epsilonSH));
  });

  test('h = 0.5 is 0.5 % RH', () => {
    const halfPercent = b4Single({ ...b4Base, h: 0.5 });
    expect(Math.abs(halfPercent.epsilonSH)).toBeGreaterThan(Math.abs(b4Single({ ...b4Base, h: 1 }).epsilonSH));
    expect(halfPercent.epsilonSH).not.toBe(b4Single({ ...b4Base, h: 50 }).epsilonSH);
  });

  test('row adapters trim surrounding whitespace like the other kernels', () => {
    const spaced = b4Single({ ...b4Base, cementType: ' R ', aggregateType: ' No Information ', specimenShape: ' 1 ' });
    expect(spaced.J).toBeCloseTo(b4Point(b4Base).J, 12);
    expect(() => b4Point({ ...b4Base, cementType: ' R ' })).toThrow(/cement type/);
  });
});

describe('B4 humidity factor stays physical', () => {
  // Regression: kh = 12.94(1 - h) - 0.2 turns negative above 98.4544 % RH, so
  // drying shrinkage became *expansion* (h = 100 % returned +103.6 microstrain)
  // and the q5 exponent went through a singularity (J exploded x4700).
  test('the unusable band is rejected instead of returning nonsense', () => {
    for (const h of [98.41, 98.5, 99, 100]) {
      expect(() => b4Single({ ...b4Base, h })).toThrow(/0 and 98\.4%/);
    }
    expect(() => b4Single({ ...b4Base, h: 105 })).toThrow(/0 and 98\.4%/);
    expect(() => b4Single({ ...b4Base, h: -1 })).toThrow(/0 and 98\.4%/);
  });

  test('every accepted humidity is finite, contractive and monotone', () => {
    let previous = -Infinity;
    for (let step = 0; step <= 9840; step += 1) {
      const h = step / 100;
      const point = b4Single({ ...b4Base, h });
      for (const value of [point.J, point.Cd, point.C0, point.epsilonSH, point.epsilonAU, point.epsilonTotal]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(point.epsilonSH).toBeLessThanOrEqual(1e-12);   // never expansive
      expect(point.Cd).toBeGreaterThanOrEqual(0);
      expect(point.epsilonSH).toBeGreaterThanOrEqual(previous - 1e-9); // magnitude shrinks with humidity
      previous = point.epsilonSH;
    }
  });

  test('the published RILEM B4 §1.9 benchmark is unaffected by the cap', () => {
    const point = b4Single(b4Base);
    expect(point.J * 1e6).toBeCloseTo(169.54, 1);
    expect(point.C0 * 1e6).toBeCloseTo(59.95, 1);
    expect(point.Cd * 1e6).toBeCloseTo(81.44, 1);
    expect(point.epsilonSH * 1e6).toBeCloseTo(-434.74, 1);
    expect(point.epsilonAU * 1e6).toBeCloseTo(-36.97, 1);
  });
});

describe('B4 loading age cannot precede drying', () => {
  /*
   * Regression: B4 defines t0 as drying start and t′ as loading. A row with
   * t′ < t0 was computed and reported as a valid one, and the drying-creep term was
   * identically zero for every age — the humidity at loading and the humidity at
   * drying start are the same instant, so the two exponentials in Eq. (34) cancel.
   * Measured: t0 = 28, t′ = 3 returned C_d = 0 at t = 365 d and t = 3650 d.
   */
  test('tPrime below t0 is rejected', () => {
    expect(() => b4Single({ ...b4Base, t0: 28, tPrime: 3 })).toThrow(/tPrime ≥ t0/);
    expect(() => b4sSingle({ ...b4Base, t0: 28, tPrime: 3 })).toThrow(/tPrime ≥ t0/);
    expect(() => b4Single({ ...b4Base, t0: 28, tPrime: 27.99 })).toThrow(/tPrime ≥ t0/);
  });

  test('tPrime equal to t0 stays legal — that is the instantaneous-loading case', () => {
    expect(() => b4Single({ ...b4Base, t0: 28, tPrime: 28 })).not.toThrow();
  });
});

describe('B4 compliance is a strain history from casting', () => {
  /*
   * Regression: the creep terms were gated on `t ≥ t′` only, so a target age before
   * loading returned the *whole* loaded response — q₁ + β(Tc)·C₀ + C_d — for a load
   * that had not been applied. Measured at t = 3 d with t′ = 28 d: J = 147.1
   * µε/MPa, of which C₀ = 119.0 and C_d = 0 — i.e. the creep that belongs to 28 days
   * of loading, reported four weeks early.
   */
  const instantaneous = () => {
    // q₁ = p₁ / (E28·1000); recover it from the loading-age point, where C₀ and C_d
    // are zero by definition.
    return b4Point({ ...b4Base, t: 28 }).J;
  };

  test('before loading, J is the instantaneous compliance and no creep is reported', () => {
    const before = b4Point({ ...b4Base, t: 3 });
    expect(before.C0).toBe(0);
    expect(before.Cd).toBe(0);
    // Both come from the same q₁, so the only difference is the 16th-digit arithmetic
    // of evaluating the temperature-transformed clock at 3 d instead of 28 d.
    expect(before.J).toBeCloseTo(instantaneous(), 12);
    expect(before.J).toBeGreaterThan(instantaneous() * 0.999999);
  });

  test('the series is monotone in age across the loading boundary', () => {
    const at = (t) => b4Point({ ...b4Base, t }).J;
    expect(at(0)).toBeLessThanOrEqual(at(3));
    expect(at(3)).toBeCloseTo(at(28), 12);
    expect(at(29)).toBeGreaterThan(at(28));
    expect(at(112)).toBeGreaterThan(at(29));
  });

  test('B4s shares the same strain-history rule', () => {
    const params = { ...b4Base, t0: 28, tPrime: 28 };
    const before = b4sPoint({ ...params, t: 3 });
    expect(before.C0).toBe(0);
    expect(before.Cd).toBe(0);
    expect(before.J).toBeCloseTo(b4sPoint({ ...params, t: 28 }).J, 12);
  });
});

describe('loading ages outside every model’s scope are refused', () => {
  test('ACI 209R-92 stops at its 365-day calibration ceiling', () => {
    // Measured before: t0 = 5000 d returned phi = 0 for every age up to 5000 d,
    // which the batch pipeline reported as a valid row.
    expect(() => aci209Single({ ...aciBase, t0: 5000 })).toThrow(/t0 ≤ 365/);
    expect(() => aci209Single({ ...aciBase, t0: 366 })).toThrow(/t0 ≤ 365/);
  });

  test('and the shipped ceiling itself still computes', () => {
    expect(aci209Single({ ...aciBase, t0: 365, t: 366 })).toBeGreaterThan(0);
  });

  test('MC2010 refuses a loading age beyond the series it reports', () => {
    expect(() => mc2010Single({ ...mc2010Base, t0: 5000 })).not.toThrow();
    expect(mc2010Single({ ...mc2010Base, t0: 5000, t: 365 }).phi).toBe(0);
    expect(() => mc2010Single({ ...mc2010Base, t0: 10001 })).toThrow(/t0 ≤ 10000/);
  });
});

describe('B4s refuses mix proportions outside the calibration set', () => {
  /*
   * B4s is strength based, so c, w/c and a/c do not enter its equations — but the
   * batch contract for the model carries the three columns, and the diagnostics table
   * already had messages for them. They were never emitted: a row with c = 50 was
   * computed exactly like one with c = 219.3.
   */
  const strengthOnly = { ...b4Base, t: 112 };
  for (const key of ['c', 'wC', 'aC', 'retarder', 'flyAsh', 'superplasticizer', 'silicaFume', 'airEntrainingAgent', 'waterReducer']) delete strengthOnly[key];

  test('a strength-only call is still legal', () => {
    expect(() => b4sSingle(strengthOnly)).not.toThrow();
    expect(b4sSingle(strengthOnly).J).toBeCloseTo(b4sSingle({ ...strengthOnly }).J, 12);
  });

  test('out-of-range proportions are reported, not ignored', () => {
    expect(() => b4sSingle({ ...strengthOnly, c: 50 })).toThrow(/200 ≤ c ≤ 1500/);
    expect(() => b4sSingle({ ...strengthOnly, wC: 1.2 })).toThrow(/0\.22 ≤ w\/c ≤ 0\.87/);
    expect(() => b4sSingle({ ...strengthOnly, aC: 0.5 })).toThrow(/1 ≤ a\/c ≤ 13\.2/);
  });
});
