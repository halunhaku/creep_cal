import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  calculate_aci209_series,
  calculate_aci209_single,
  calculate_b4_series,
  calculate_b4_single,
  calculate_b4s_series,
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
    /*
     * The manual's total is 1.64 — the sum of its own components, which the two
     * assertions above already pin — and it then divides by 1.05:
     *
     *   "According to Model Code 2010, the creep value is related to the tangent
     *    Young's modulus E_c, where E_c being defined as 1.05 · E_cm. To account
     *    for this, SOFiSTiK adopts this scaling for the computed creep
     *    coefficient (in SOFiSTiK, all computations are consistently based on
     *    E_cm).  ϕ(t,t₀) = 1.64 / 1.05 = 1.56"
     *                    — SOFiSTiK Verification Manual, DCE-MC1 §38.4, p. 320 (2025)
     *
     * So the 1.05 is the reference tool's modulus convention, not a coefficient
     * of the MC2010 creep model: it must not move into the kernel. fib's own
     * implementation (structuralcodes, mc2010/_concrete_creep_and_shrinkage.py)
     * has no such factor either — φ is β_bc·β_bc(t) + β_dc·β_RH·β_t0·β_t with the
     * k_σ correction, exactly what this kernel computes.
     */
    const TANGENT_MODULUS_RATIO = 1.05;   // E_c = 1.05 · E_cm, SOFiSTiK's basis
    expect(Math.abs(point.phi / TANGENT_MODULUS_RATIO - 1.56)).toBeLessThan(0.01);

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

  test('matches official RILEM B4 §1.9 composition-based benchmarks', () => {
    const plain = {
      t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50,
      fc: 27.6, vS: 19.05, c: 219.3, wC: 0.60, aC: 7.0,
      cementType: 'R', aggregateType: 'No Information', specimenShape: '1',
      retarder: 0, flyAsh: 0, superplasticizer: 0, silicaFume: 0,
      airEntrainingAgent: 0, waterReducer: 0, t: 112,
    };
    const r1 = b4Point(plain);
    expect(r1.J * 1e6).toBeCloseTo(169.54, 1);
    expect(r1.C0 * 1e6).toBeCloseTo(59.95, 1);
    expect(r1.Cd * 1e6).toBeCloseTo(81.44, 1);
    expect(r1.epsilonSH * 1e6).toBeCloseTo(-434.74, 1);
    expect(r1.epsilonAU * 1e6).toBeCloseTo(-36.97, 1);
    expect(r1.epsilonTotal * 1e6).toBeCloseTo(-471.71, 1);

    const withFlyAsh = b4Point({ ...plain, flyAsh: 20 });
    expect(withFlyAsh.C0 * 1e6).toBeCloseTo(29.69, 1);
    expect(withFlyAsh.epsilonSH * 1e6).toBeCloseTo(-455.06, 1);
    expect(withFlyAsh.epsilonAU * 1e6).toBeCloseTo(-45.11, 1);
  });

  /*
   * The published cement-type table, pinned so it cannot be "corrected" by
   * accident. B4 gives ε_au,cem = 210 × 10⁻⁶ (R), −84 × 10⁻⁶ (RS), 0 (SL) and
   * its autogenous formula starts with a minus sign, so RS concrete expands and
   * SL concrete has no autogenous term at all — while B4s, a separate fit with a
   * single ε_au,cem = 78.2 × 10⁻⁶, stays contractive for every class. The two
   * models disagreeing in sign for RS is the model, not a bug.
   */
  test('B4 autogenous shrinkage follows the published cement-type table', () => {
    const plain = {
      t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50,
      fc: 27.6, vS: 19.05, c: 219.3, wC: 0.60, aC: 7.0,
      aggregateType: 'No Information', specimenShape: '1',
      retarder: 0, flyAsh: 0, superplasticizer: 0, silicaFume: 0,
      airEntrainingAgent: 0, waterReducer: 0, t: 112,
    };
    const epsAu = (cementType) => b4Point({ ...plain, cementType }).epsilonAU * 1e6;

    expect(epsAu('R')).toBeCloseTo(-36.971, 3);   // the §1.9 benchmark value
    expect(Math.abs(epsAu('SL'))).toBe(0);        // ε_au,cem = 0 (the sign of zero is not the point)
    expect(epsAu('RS')).toBeGreaterThan(0);       // ε_au,cem = −84 × 10⁻⁶
    expect(epsAu('RS')).toBeCloseTo(0.076, 3);

    const later = (cementType) => b4Point({ ...plain, cementType, t: 3650 }).epsilonAU * 1e6;
    expect(later('R')).toBeCloseTo(-37.817, 3);
    expect(later('RS')).toBeCloseTo(15.059, 3);

    // B4s has one value for every class, so it never expands.
    const b4sPlain = { ...plain, t: 112 };
    for (const cementType of ['R', 'RS', 'SL']) {
      expect(b4sPoint({ ...b4sPlain, cementType }).epsilonAU * 1e6).toBeCloseTo(-53.270, 3);
    }
  });

  test('matches official RILEM B4s §1.8/§1.9 strength-based benchmark', () => {    const plain = {
      t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50,
      fc: 27.6, vS: 19.05, cementType: 'R', aggregateType: 'No Information',
      specimenShape: '1', t: 112,
    };
    const r = b4sPoint(plain);
    expect(r.C0 * 1e6).toBeCloseTo(55.33, 1);
    expect(r.Cd * 1e6).toBeCloseTo(104.56, 1);
    expect(r.epsilonSH * 1e6).toBeCloseTo(-585.07, 1);
    expect(r.epsilonAU * 1e6).toBeCloseTo(-53.27, 1);
    expect(r.J * 1e6).toBeCloseTo(188.03, 1);
  });

  test.each([
    {
      t0: 7, tPrime: 28, Tcur: 25, Tsh: 20, Tc: 30, h: 70, fc: 40, vS: 100,
      c: 350, wC: 0.42, aC: 5.8, cementType: 'R',
      aggregateType: 'Quartzite', specimenShape: '2',
      retarder: 0, flyAsh: 0, superplasticizer: 1.5, silicaFume: 0,
      airEntrainingAgent: 0, waterReducer: 0,
    },
    {
      t0: 3, tPrime: 14, Tcur: 22, Tsh: 15, Tc: 25, h: 55, fc: 55, vS: 75,
      c: 400, wC: 0.36, aC: 6.2, cementType: 'SL',
      aggregateType: 'Limestone', specimenShape: '5',
      retarder: 0.3, flyAsh: 20, superplasticizer: 0, silicaFume: 5,
      airEntrainingAgent: 0, waterReducer: 0,
    },
  ])('RILEM B4 JS and Rust single and series match for %#', (params) => {
    const rustParams = {
      t0: params.t0,
      t_prime: params.tPrime,
      t_cur: params.Tcur,
      t_sh: params.Tsh,
      t_c: params.Tc,
      h: params.h,
      fc: params.fc,
      v_s: params.vS,
      c: params.c,
      w_c: params.wC,
      a_c: params.aC,
      cement_type: params.cementType,
      aggregate_type: params.aggregateType,
      specimen_shape: params.specimenShape,
      retarder: params.retarder,
      fly_ash: params.flyAsh,
      superplasticizer: params.superplasticizer,
      silica_fume: params.silicaFume,
      air_entraining_agent: params.airEntrainingAgent,
      water_reducer: params.waterReducer,
    };

    const series = calculate_b4_series(rustParams, 1000);

    for (const t of [0, params.t0, params.tPrime, params.tPrime + 1, 90, 365, 1000]) {
      const jsResult = b4Point({ ...params, t });
      const rustResult = calculate_b4_single(rustParams, t);
      const seriesResult = series[t];

      expect(seriesResult.t).toBe(t);
      for (const key of ['J', 'J_GPa', 'C0', 'Cd', 'epsilonSH', 'epsilonAU', 'epsilonTotal']) {
        const rustKey = key === 'J' ? 'j'
          : key === 'J_GPa' ? 'j_gpa'
          : key === 'C0' ? 'c0'
          : key === 'Cd' ? 'cd'
          : key === 'epsilonSH' ? 'epsilon_sh'
          : key === 'epsilonAU' ? 'epsilon_au'
          : 'epsilon_total';
        expectConsistent(jsResult[key], rustResult[rustKey]);
        expectConsistent(jsResult[key], seriesResult[rustKey]);
      }
    }
  });

  test.each([
    {
      t0: 7, tPrime: 28, Tcur: 25, Tsh: 20, Tc: 30, h: 70, fc: 40, vS: 100,
      cementType: 'R', aggregateType: 'Quartzite', specimenShape: '2',
    },
    {
      t0: 3, tPrime: 14, Tcur: 20, Tsh: 10, Tc: 22, h: 55, fc: 55, vS: 75,
      cementType: 'RS', aggregateType: 'Granite', specimenShape: '4',
    },
  ])('RILEM B4s JS and Rust single and series match for %#', (params) => {
    const rustParams = {
      t0: params.t0,
      t_prime: params.tPrime,
      t_cur: params.Tcur,
      t_sh: params.Tsh,
      t_c: params.Tc,
      h: params.h,
      fc: params.fc,
      v_s: params.vS,
      cement_type: params.cementType,
      aggregate_type: params.aggregateType,
      specimen_shape: params.specimenShape,
    };

    const series = calculate_b4s_series(rustParams, 1000);

    for (const t of [0, params.t0, params.tPrime, params.tPrime + 1, 90, 365, 1000]) {
      const jsResult = b4sPoint({ ...params, t });
      const rustResult = calculate_b4s_single(rustParams, t);
      const seriesResult = series[t];

      expect(seriesResult.t).toBe(t);
      for (const key of ['J', 'J_GPa', 'C0', 'Cd', 'epsilonSH', 'epsilonAU', 'epsilonTotal']) {
        const rustKey = key === 'J' ? 'j'
          : key === 'J_GPa' ? 'j_gpa'
          : key === 'C0' ? 'c0'
          : key === 'Cd' ? 'cd'
          : key === 'epsilonSH' ? 'epsilon_sh'
          : key === 'epsilonAU' ? 'epsilon_au'
          : 'epsilon_total';
        expectConsistent(jsResult[key], rustResult[rustKey]);
        expectConsistent(jsResult[key], seriesResult[rustKey]);
      }
    }
  });

  test('RILEM B4 and B4s enforce formal calibration ranges', () => {
    const valid = {
      t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50,
      fc: 27.6, vS: 19.05, c: 219.3, wC: 0.60, aC: 7.0,
      cementType: 'R', aggregateType: 'No Information', specimenShape: '1',
      retarder: 0, flyAsh: 0, superplasticizer: 0, silicaFume: 0,
      airEntrainingAgent: 0, waterReducer: 0, t: 112,
    };

    expect(() => b4Point({ ...valid, fc: 14 })).toThrow(/15 ≤ fc ≤ 70/);
    expect(() => b4Point({ ...valid, fc: 75 })).toThrow(/15 ≤ fc ≤ 70/);
    expect(() => b4Point({ ...valid, vS: 10 })).toThrow(/12 ≤ V\/S ≤ 120/);
    expect(() => b4Point({ ...valid, c: 150 })).toThrow(/200 ≤ c ≤ 1500/);
    expect(() => b4Point({ ...valid, wC: 0.18 })).toThrow(/0.22 ≤ w\/c ≤ 0.87/);
    expect(() => b4Point({ ...valid, aC: 0.8 })).toThrow(/1 ≤ a\/c ≤ 13.2/);
    expect(() => b4Point({ ...valid, Tcur: 32 })).toThrow(/20 ≤ Tcur ≤ 30/);
    expect(() => b4Point({ ...valid, h: 105 })).toThrow(/0 and 100%/);
    expect(() => b4Point({ ...valid, cementType: 'X' })).toThrow(/Unsupported/);

    const validS = {
      t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50,
      fc: 27.6, vS: 19.05, cementType: 'R', aggregateType: 'No Information',
      specimenShape: '1', t: 112,
    };
    expect(() => b4sPoint({ ...validS, fc: 14 })).toThrow(/15 ≤ fc ≤ 70/);
    expect(() => b4sPoint({ ...validS, vS: 125 })).toThrow(/12 ≤ V\/S ≤ 120/);
  });
});
