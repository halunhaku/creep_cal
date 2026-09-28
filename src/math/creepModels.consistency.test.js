import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  calculate_aci209_series,
  calculate_aci209_single,
  calculate_b4_single,
  calculate_b4s_single,
  calculate_mc2010_series,
  calculate_mc2010_single,
  initSync,
} from '../wasm-pkg/creep_calculator_engine.js';
import { aci209Phi, b4Point, b4sPoint, mc2010Point } from './creepModels';

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
    {
      curingType: 'moist', t0: 28, H: 70, VS: 100,
      slump: 100, fineAggregate: 50, airContent: 8,
    },
    {
      curingType: 'steam', t0: 7, H: 50, VS: 150,
      slump: 75, fineAggregate: 45, airContent: 4,
    },
  ])('ACI 209R-92 single and series engines match for %#', (params) => {
    const series = calculate_aci209_series(params, 10000);

    for (const t of [0, params.t0, params.t0 + 1, 90, 365, 10000]) {
      const jsValue = aci209Phi({ ...params, t });
      expectConsistent(jsValue, calculate_aci209_single(params, t));
      expect(series[t].t).toBe(t);
      expectConsistent(jsValue, series[t].phi);
    }
  });

  test.each([
    { fcm: 28, RH: 40, t0: 7, Ac: 75000, u: 1000, T: 20, Cs: '32.5 R', sigma: 10 },
    { fcm: 40, RH: 70, t0: 1, Ac: 75000, u: 1000, T: 5, Cs: '32.5 N', sigma: 12 },
    { fcm: 55, RH: 85, t0: 7, Ac: 90000, u: 1200, T: 30, Cs: '52.5 R', sigma: -30 },
  ])('fib MC 2010 single and series engines match for %#', (params) => {
    const rustParams = {
      fcm: params.fcm,
      rh: params.RH,
      t0: params.t0,
      ac: params.Ac,
      u: params.u,
      t: params.T,
      cement_type: params.Cs,
      sigma: params.sigma,
    };
    const series = calculate_mc2010_series(rustParams, 10000);

    for (const t of [0, params.t0, params.t0 + 1, 14, 90, 365, 10000]) {
      const jsPoint = mc2010Point({ ...params, t });
      const rustPoint = calculate_mc2010_single(rustParams, t);
      const seriesPoint = series[t];

      expect(seriesPoint.t).toBe(t);
      for (const key of ['phi', 'phi_bc', 'phi_dc', 'nonlinear_factor', 't0_adjusted']) {
        expectConsistent(jsPoint[key], rustPoint[key]);
        expectConsistent(jsPoint[key], seriesPoint[key]);
      }
    }
  });

  test('fib MC 2010 matches fib-maintained linear and nonlinear benchmarks', () => {
    const base = {
      fcm: 28, RH: 40, t0: 7, Ac: 75000, u: 1000,
      T: 20, Cs: '32.5 R', t: 14,
    };
    const linear = mc2010Point({ ...base, sigma: 10 });
    const nonlinear = mc2010Point({ ...base, sigma: -15 });

    expect(linear.phi_bc).toBeCloseTo(0.853184, 5);
    expect(linear.phi_dc).toBeCloseTo(0.85125, 5);
    expect(linear.phi).toBeCloseTo(1.70443, 4);
    expect(linear.nonlinear_factor).toBe(1);
    expect(nonlinear.phi).toBeCloseTo(2.08924, 4);
    expect(nonlinear.nonlinear_factor).toBeGreaterThan(1);
  });

  test('matches the published DCE-MC1 MC2010 worked benchmark', () => {
    // SOFiSTiK Verification Manual DCE-MC1 (2025), pp. 4 and 7–8.
    // It applies MC2010 §5.1.9.4.3 and Eq. 5.1-85 to a C35/45,
    // 1000 × 1000 mm member at RH=80%, loaded at 28 d and evaluated at 36500 d.
    const params = {
      fcm: 43, RH: 80, t0: 28, Ac: 1000000, u: 4000,
      T: 20, Cs: '42.5 N', sigma: 0, t: 36500,
    };
    const rustParams = {
      fcm: params.fcm,
      rh: params.RH,
      t0: params.t0,
      ac: params.Ac,
      u: params.u,
      t: params.T,
      cement_type: params.Cs,
      sigma: params.sigma,
    };
    const point = mc2010Point(params);
    const rustPoint = calculate_mc2010_single(rustParams, params.t);
    const h = 2 * params.Ac / params.u;
    const alphaFcm = Math.sqrt(35 / params.fcm);
    const betaH = Math.min(1.5 * h + 250 * alphaFcm, 1500 * alphaFcm);
    const elapsed = params.t - params.t0;
    const gamma = 1 / (2.3 + 3.5 / Math.sqrt(point.t0_adjusted));
    const betaBcFcm = 1.8 / params.fcm ** 0.7;
    const betaBcTime = point.phi_bc / betaBcFcm;
    const betaDcFcm = 412 / params.fcm ** 1.4;
    const betaDcRh = (1 - params.RH / 100) / (0.1 * (h / 100)) ** (1 / 3);
    const betaDcT0 = 1 / (0.1 + point.t0_adjusted ** 0.2);
    const betaDcTime = (elapsed / (betaH + elapsed)) ** gamma;

    expect(Math.abs(point.t0_adjusted - 27.947)).toBeLessThan(0.001);
    expect(betaBcFcm).toBeCloseTo(0.12937, 5);
    expect(betaBcTime).toBeCloseTo(10.71, 2);
    expect(Math.abs(point.phi_bc - 1.385)).toBeLessThan(0.001);
    expect(betaDcFcm).toBeCloseTo(2.1283, 4);
    expect(betaDcRh).toBeCloseTo(0.2520, 4);
    expect(betaDcT0).toBeCloseTo(0.4886, 4);
    expect(Math.abs(alphaFcm - 0.9021)).toBeLessThan(0.0001);
    expect(betaH).toBeCloseTo(975.548, 3);
    expect(gamma).toBeCloseTo(0.3376, 4);
    expect(betaDcTime).toBeCloseTo(0.9911, 4);
    expect(point.phi_dc).toBeCloseTo(0.2597, 4);
    expect(Math.abs(point.phi - 1.64)).toBeLessThan(0.01);
    expect(Math.abs(point.phi / 1.05 - 1.563)).toBeLessThan(0.005);

    for (const key of ['phi', 'phi_bc', 'phi_dc', 'nonlinear_factor', 't0_adjusted']) {
      expectConsistent(point[key], rustPoint[key]);
    }
  });

  test('fib MC 2010 enforces adjusted-age floor and formal input ranges', () => {
    const boundary = {
      fcm: 40, RH: 70, t0: 1, Ac: 75000, u: 1000,
      T: 5, Cs: '32.5 N', sigma: 12, t: 365,
    };
    const point = mc2010Point(boundary);

    expect(point.t0_adjusted).toBe(0.5);
    expect(point.phi).toBeCloseTo(3.1414340357353483, 12);
    expect(() => mc2010Point({ ...boundary, fcm: 19 })).toThrow(/20 ≤ fcm ≤ 130/);
    expect(() => mc2010Point({ ...boundary, RH: 39 })).toThrow(/40 ≤ RH ≤ 100/);
    expect(() => mc2010Point({ ...boundary, T: 31 })).toThrow(/5 ≤ T ≤ 30/);
    expect(() => mc2010Point({ ...boundary, sigma: 25 })).toThrow(/sigma/);
    expect(() => mc2010Point({ ...boundary, Cs: '42.5R' })).toThrow(/Unsupported/);
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
