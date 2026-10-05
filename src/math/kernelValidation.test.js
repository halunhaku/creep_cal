import { describe, expect, test } from 'vitest';
import { aci209Phi, aci209Single, b4Point, b4Single, b4sSingle, mc2010Point, mc2010Single } from './creepModels';

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
});

describe('B4 humidity factor stays physical', () => {
  // Regression: kh = 12.94(1 - h) - 0.2 turns negative above 98.4544 % RH, so
  // drying shrinkage became *expansion* (h = 100 % returned +103.6 microstrain)
  // and the q5 exponent went through a singularity (J exploded x4700).
  test('the unusable band is rejected instead of returning nonsense', () => {
    for (const h of [98.41, 98.5, 99, 100]) {
      expect(() => b4Single({ ...b4Base, h })).toThrow(/0 and 100%/);
    }
    expect(() => b4Single({ ...b4Base, h: 105 })).toThrow(/0 and 100%/);
    expect(() => b4Single({ ...b4Base, h: -1 })).toThrow(/0 and 100%/);
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
