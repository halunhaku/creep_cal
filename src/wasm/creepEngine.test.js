import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  calculate_aci209_series,
  calculate_b4_series,
  calculate_b4s_series,
  calculate_mc2010_series,
  initSync,
} from '../wasm-pkg/creep_calculator_engine.js';
import {
  buildAci209Params,
  buildB4Params,
  buildB4sParams,
  buildMc2010Params,
  errorMessage,
} from './creepEngine';
import { aci209Phi, b4Point, b4sPoint, mc2010Point } from '../math/creepModels';

const wasmBytes = readFileSync(resolve(process.cwd(), 'src/wasm-pkg/creep_calculator_engine_bg.wasm'));
beforeAll(() => initSync({ module: wasmBytes }));

const ACI_UI = { curingType: 'moist', t0: 28, H: 70, VS: 100, slump: 100, fineAggregate: 50, airContent: 8, targetAge: 365 };
const MC_UI = { fcm: 40, RH: 70, t0: 28, Ac: 90000, u: 1200, T: 20, Cs: '42.5 R', sigma: 12, targetAge: 365 };
const B4_UI = {
  t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 27.6, vS: 19.05, c: 219.3,
  wC: 0.6, aC: 7, cementType: 'R', aggregateType: 'No Information', specimenShape: '1',
  retarder: 0, flyAsh: 0, superplasticizer: 0, silicaFume: 0, airEntrainingAgent: 0,
  waterReducer: 0, targetAge: 112,
};
const B4S_UI = {
  t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 27.6, vS: 19.05,
  cementType: 'R', aggregateType: 'No Information', specimenShape: '1', targetAge: 112,
};

describe('errorMessage normalises anything thrown across the wasm boundary', () => {
  test.each([
    ['Error instance', new Error('boom'), 'boom'],
    ['bare string (Rust JsValue::from_str)', 'MC2010 requires 40 ≤ RH ≤ 100%.', 'MC2010 requires 40 ≤ RH ≤ 100%.'],
    ['null', null, 'Unknown error'],
    ['undefined', undefined, 'Unknown error'],
    ['number', 42, '42'],
    ['Error without message', new Error(), 'Error'],
  ])('%s', (_label, input, expected) => {
    expect(errorMessage(input)).toBe(expected);
  });

  test('a bare-string throw from the prebuilt wasm no longer renders as "undefined"', () => {
    const bad = { fcm: 40, rh: 500, t0: 28, ac: 90000, u: 1200, t: 20, cement_type: '42.5 R', sigma: 12 };
    try {
      calculate_mc2010_series(bad, 10);
      throw new Error('expected the kernel to reject RH = 500%');
    } catch (error) {
      expect(errorMessage(error)).toMatch(/RH/);
      expect(errorMessage(error)).not.toBe('undefined');
    }
  });
});

describe('wasm parameter builders', () => {
  test('produce the exact shape the kernels expect', () => {
    expect(buildAci209Params(ACI_UI)).toEqual({
      curingType: 'moist', t0: 28, H: 70, VS: 100, slump: 100, fineAggregate: 50, airContent: 8,
    });
    expect(buildMc2010Params(MC_UI)).toEqual({
      fcm: 40, rh: 70, t0: 28, ac: 90000, u: 1200, t: 20, cement_type: '42.5 R', sigma: 12,
    });
    expect(buildB4sParams(B4S_UI)).toEqual({
      t0: 28, t_prime: 28, t_cur: 20, t_sh: 20, t_c: 20, h: 50, fc: 27.6, v_s: 19.05,
      cement_type: 'R', aggregate_type: 'No Information', specimen_shape: '1',
    });
    expect(Object.keys(buildB4Params(B4_UI))).toHaveLength(20);
    // targetAge is a UI-only selector and must never reach the kernel.
    for (const build of [buildAci209Params, buildMc2010Params, buildB4Params, buildB4sParams]) {
      expect(build({ ...B4_UI, ...ACI_UI, ...MC_UI, targetAge: 999 })).not.toHaveProperty('targetAge');
    }
  });

  test('reject a missing key and drop unknown UI keys instead of forwarding them', () => {
    const { fineAggregate, ...withoutFineAggregate } = ACI_UI;
    expect(() => buildAci209Params(withoutFineAggregate)).toThrow(/missing fineAggregate/);

    // A typo'd UI key must not silently reach the kernel; the builder emits only
    // the documented columns, and the contract check guards the builder itself.
    const withTypo = buildB4Params({ ...B4_UI, tPrimeTypo: 1 });
    expect(withTypo).not.toHaveProperty('tPrimeTypo');
    expect(withTypo.t_prime).toBe(28);
  });

  test('the Rust path through the builders matches the JavaScript kernels', () => {
    const aciRust = calculate_aci209_series(buildAci209Params(ACI_UI), 365);
    expect(aciRust[365].phi).toBeCloseTo(aci209Phi({ ...ACI_UI, t: 365 }), 12);

    const mcRust = calculate_mc2010_series(buildMc2010Params(MC_UI), 365);
    expect(mcRust[365].phi).toBeCloseTo(mc2010Point({ ...MC_UI, t: 365 }).phi, 12);

    const b4Rust = calculate_b4_series(buildB4Params(B4_UI), 112);
    expect(b4Rust[112].j).toBeCloseTo(b4Point({ ...B4_UI, t: 112 }).J, 12);

    const b4sRust = calculate_b4s_series(buildB4sParams(B4S_UI), 112);
    expect(b4sRust[112].j).toBeCloseTo(b4sPoint({ ...B4S_UI, t: 112 }).J, 12);
  });
});
