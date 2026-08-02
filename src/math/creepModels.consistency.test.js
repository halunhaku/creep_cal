import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  calculate_aci209_single,
  calculate_b4_single,
  calculate_b4s_single,
  calculate_mc2010_single,
  initSync,
} from '../wasm-pkg/creep_calculator_engine.js';
import { aci209Phi, b4Point, b4sPoint, mc2010Phi } from './creepModels';

const wasmBytes = readFileSync(
  resolve(process.cwd(), 'src/wasm-pkg/creep_calculator_engine_bg.wasm'),
);

function expectConsistent(jsValue, rustValue) {
  expect(Number.isFinite(jsValue)).toBe(true);
  expect(Number.isFinite(rustValue)).toBe(true);
  expect(Math.abs(jsValue - rustValue)).toBeLessThanOrEqual(
    Math.max(1e-12, Math.abs(jsValue) * 1e-10),
  );
}

beforeAll(() => {
  initSync({ module: wasmBytes });
});

describe('JavaScript and Rust model consistency', () => {
  test.each([
    { t0: 28, H: 70, VS: 100, sPhi: 0.5, Cc: 350, alpha: 0.08 },
    { t0: 7, H: 50, VS: 150, sPhi: 0.45, Cc: 420, alpha: 0.04 },
  ])('ACI 209R-92 matches for %#', (params) => {
    const rustParams = {
      t0: params.t0,
      h: params.H,
      vs: params.VS,
      s_phi: params.sPhi,
      cc: params.Cc,
      alpha: params.alpha,
    };

    for (const t of [params.t0, params.t0 + 1, 90, 365, 10000]) {
      expectConsistent(
        aci209Phi(params.t0, params.H, params.VS, params.sPhi, params.Cc, params.alpha, t),
        calculate_aci209_single(rustParams, t),
      );
    }
  });

  test.each([
    { fcm: 40, RH: 70, t0: 28, Ac: 1000, u: 400, T: 20, Cs: '42.5R' },
    { fcm: 55, RH: 85, t0: 7, Ac: 90000, u: 1200, T: 35, Cs: '32.5N' },
  ])('fib MC 2010 matches for %#', (params) => {
    const rustParams = {
      fcm: params.fcm,
      rh: params.RH,
      t0: params.t0,
      ac: params.Ac,
      u: params.u,
      t: params.T,
      cement_type: params.Cs,
    };

    for (const t of [params.t0, params.t0 + 1, 90, 365, 10000]) {
      expectConsistent(
        mc2010Phi(params.fcm, params.RH, params.t0, params.Ac, params.u, params.T, params.Cs, t),
        calculate_mc2010_single(rustParams, t),
      );
    }
  });

  test.each([
    {
      t0: 7, tPrime: 28, T: 20, h: 70, fc: 40, vS: 100,
      c: 350, wC: 0.42, aC: 5.8, cementType: 'R',
      aggregateType: 'Quartzite', specimenShape: '2',
    },
    {
      t0: 3, tPrime: 14, T: 30, h: 55, fc: 55, vS: 75,
      c: 400, wC: 0.36, aC: 6.2, cementType: 'SL',
      aggregateType: 'Limestone', specimenShape: '5',
    },
  ])('B4 matches for %#', (params) => {
    const rustShapes = {
      1: 'infinite slab',
      2: 'infinite cylinder',
      3: 'infinite square prism',
      4: 'sphere',
      5: 'cube',
    };
    const rustParams = {
      t0: params.t0,
      t_prime: params.tPrime,
      t_temp: params.T,
      h: params.h,
      fc: params.fc,
      v_s: params.vS,
      c: params.c,
      w_c: params.wC,
      a_c: params.aC,
      cement_type: params.cementType,
      aggregate_type: params.aggregateType === 'Quartzite' ? 'Quartz' : params.aggregateType,
      specimen_shape: rustShapes[params.specimenShape],
    };

    for (const t of [params.tPrime + 1, 90, 365, 10000]) {
      const jsResult = b4Point({ ...params, t });
      const rustResult = calculate_b4_single(rustParams, t);
      expectConsistent(jsResult.J, rustResult.j);
      expectConsistent(jsResult.epsilonSH, rustResult.epsilon_sh);
      expectConsistent(jsResult.epsilonAU, rustResult.epsilon_au);
    }
  });

  test.each([
    {
      t0: 7, tPrime: 28, T: 20, h: 70, fc: 40, vS: 100,
      cementType: 'R', aggregateType: 'Quartzite', specimenShape: '2',
    },
    {
      t0: 3, tPrime: 14, T: 30, h: 55, fc: 55, vS: 75,
      cementType: 'RS', aggregateType: 'Granite', specimenShape: '4',
    },
  ])('B4S matches for %#', (params) => {
    const rustParams = {
      t0: params.t0,
      t_prime: params.tPrime,
      t_temp: params.T,
      h: params.h,
      fc: params.fc,
      v_s: params.vS,
      cement_type: params.cementType,
      aggregate_type: params.aggregateType,
      specimen_shape: params.specimenShape,
    };

    for (const t of [params.tPrime + 1, 90, 365, 10000]) {
      const jsResult = b4sPoint({ ...params, t });
      const rustResult = calculate_b4s_single(rustParams, t);
      expectConsistent(jsResult.J, rustResult.j);
      expectConsistent(jsResult.epsilonSH, rustResult.epsilon_sh);
      expectConsistent(jsResult.epsilonAU, rustResult.epsilon_au);
    }
  });
});
