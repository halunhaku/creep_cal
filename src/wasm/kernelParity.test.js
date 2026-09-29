import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import * as Rust from '../wasm-pkg/creep_calculator_engine.js';
import { aci209Phi, b4Point, b4sPoint, mc2010Point } from '../math/creepModels';

const wasmBytes = readFileSync(resolve(process.cwd(), 'src/wasm-pkg/creep_calculator_engine_bg.wasm'));
beforeAll(() => Rust.initSync({ module: wasmBytes }));

/**
 * Randomised JavaScript <-> Rust parity sweep.
 *
 * The committed `src/wasm-pkg/*` is a build artifact, and the fixed-value
 * consistency tests only cover a handful of parameter sets. A wasm that has
 * drifted from the Rust source (e.g. built before an admixture-table fix) still
 * passes those, so this sweep samples the whole calibration box instead.
 *
 * Deterministic: the PRNG is seeded, so a failure is reproducible.
 */
let seed = 0x5eed;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const SAMPLES = 150;

const aciParams = () => ({ curingType: pick(['moist', 'steam']), t0: between(1, 365), H: between(0, 100), VS: between(1, 1000), slump: between(0, 300), fineAggregate: between(0, 100), airContent: between(0, 20) });
const aciWasm = (p) => ({ curingType: p.curingType, t0: p.t0, H: p.H, VS: p.VS, slump: p.slump, fineAggregate: p.fineAggregate, airContent: p.airContent });

const mcParams = () => ({ fcm: between(20, 130), RH: between(40, 100), t0: between(1, 365), Ac: between(1, 1e6), u: between(1, 10000), T: between(5, 30), Cs: pick(['32.5 N', '32.5 R', '42.5 N', '42.5 R', '52.5 N', '52.5 R']), sigma: between(-12, 12) });
const mcWasm = (p) => ({ fcm: p.fcm, rh: p.RH, t0: p.t0, ac: p.Ac, u: p.u, t: p.T, cement_type: p.Cs, sigma: p.sigma });

const b4Params = () => ({ t0: between(1, 365), tPrime: between(1, 365), Tcur: between(20, 30), Tsh: between(-25, 75), Tc: between(-25, 75), h: between(1, 98.4), fc: between(15, 70), vS: between(12, 120), c: between(200, 1500), wC: between(0.22, 0.87), aC: between(1, 13.2), cementType: pick(['R', 'RS', 'SL']), aggregateType: pick(['Diabase', 'Quartzite', 'Limestone', 'Sandstone', 'Granite', 'Quartz Diorite', 'No Information']), specimenShape: pick(['1', '2', '3', '4', '5']), retarder: between(0, 0.6), flyAsh: between(0, 30), superplasticizer: between(0, 5), silicaFume: between(0, 18), airEntrainingAgent: between(0, 0.05), waterReducer: between(0, 3) });
const b4Wasm = (p) => ({ t0: p.t0, t_prime: p.tPrime, t_cur: p.Tcur, t_sh: p.Tsh, t_c: p.Tc, h: p.h, fc: p.fc, v_s: p.vS, c: p.c, w_c: p.wC, a_c: p.aC, cement_type: p.cementType, aggregate_type: p.aggregateType, specimen_shape: p.specimenShape, retarder: p.retarder, fly_ash: p.flyAsh, superplasticizer: p.superplasticizer, silica_fume: p.silicaFume, air_entraining_agent: p.airEntrainingAgent, water_reducer: p.waterReducer });
const b4sWasm = (p) => { const { c, w_c, a_c, retarder, fly_ash, superplasticizer, silica_fume, air_entraining_agent, water_reducer, ...rest } = b4Wasm(p); return rest; };

// wasm snake_case/`J` vs JS camelCase/`J`
const B4_FIELDS = { j: 'J', j_gpa: 'J_GPa', c0: 'C0', cd: 'Cd', epsilon_sh: 'epsilonSH', epsilon_au: 'epsilonAU', epsilon_total: 'epsilonTotal' };
const MODELS = [
  { name: 'ACI 209R-92', gen: aciParams, toWasm: aciWasm, fields: null, single: 'calculate_aci209_single', js: (p, t) => aci209Phi({ ...p, t }) },
  { name: 'fib MC2010', gen: mcParams, toWasm: mcWasm, fields: ['phi', 'phi_bc', 'phi_dc', 'nonlinear_factor', 't0_adjusted'], single: 'calculate_mc2010_single', js: (p, t) => mc2010Point({ ...p, t }) },
  { name: 'RILEM B4', gen: b4Params, toWasm: b4Wasm, fields: Object.keys(B4_FIELDS), jsField: B4_FIELDS, single: 'calculate_b4_single', js: (p, t) => b4Point({ ...p, t }) },
  { name: 'RILEM B4s', gen: b4Params, toWasm: b4sWasm, fields: Object.keys(B4_FIELDS), jsField: B4_FIELDS, single: 'calculate_b4s_single', js: (p, t) => b4sPoint({ ...p, t }) },
];

const consistent = (jsValue, rustValue) => Number.isFinite(jsValue) && Number.isFinite(rustValue)
  && Math.abs(jsValue - rustValue) <= Math.max(1e-12, Math.abs(jsValue) * 1e-9);

describe('randomised JavaScript/Rust kernel parity', () => {
  test.each(MODELS.map((m) => [m.name, m]))('%s matches the JS kernel over %s samples', (_name, model) => {
    let comparisons = 0;
    for (let i = 0; i < SAMPLES; i += 1) {
      const params = model.gen();
      const t = between(0, 12000);
      const expected = model.js(params, t);
      const actual = Rust[model.single](model.toWasm(params), t);
      const pairs = model.fields
        ? model.fields.map((field) => [expected[model.jsField ? model.jsField[field] : field], actual[field], field])
        : [[expected, actual, 'phi']];
      for (const [jsValue, rustValue, field] of pairs) {
        expect(consistent(jsValue, rustValue), `${field} at t=${t}: js=${jsValue} rust=${rustValue} params=${JSON.stringify(params)}`).toBe(true);
        comparisons += 1;
      }
    }
    expect(comparisons).toBeGreaterThan(0);
  });

  test('the wasm series stays aligned with the JS kernels and with itself', () => {
    const b4 = b4Params();
    const series = Rust.calculate_b4_series(b4Wasm(b4), 300);
    expect(series).toHaveLength(301);
    for (const t of [0, 1, 28, 112, 300]) {
      expect(series[t].t).toBe(t);
      expect(consistent(b4Point({ ...b4, t }).J, series[t].j)).toBe(true);
      expect(consistent(Rust.calculate_b4_single(b4Wasm(b4), t).j, series[t].j)).toBe(true);
    }
  });
});

describe('wasm boundary contract', () => {
  test('validation errors cross the boundary as real Error objects', () => {
    const cases = [
      () => Rust.calculate_aci209_single(aciWasm({ ...aciParams(), H: 500 }), 365),
      () => Rust.calculate_mc2010_single(mcWasm({ ...mcParams(), RH: 500 }), 365),
      () => Rust.calculate_b4_single(b4Wasm({ ...b4Params(), h: 99 }), 112),
      () => Rust.calculate_b4s_single(b4sWasm({ ...b4Params(), fc: 200 }), 112),
    ];
    for (const probe of cases) {
      let caught;
      try { probe(); } catch (error) { caught = error; }
      // A bare string here means the wasm predates the js_sys::Error fix and the
      // UI would log "Calculation failed: undefined".
      expect(caught).toBeInstanceOf(Error);
      expect(typeof caught.message).toBe('string');
      expect(caught.message.length).toBeGreaterThan(0);
    }
  });

  test('batch endpoints return plain objects, not ES Maps', () => {
    const rows = Rust.calculate_aci209_batch([{ ...aciWasm(aciParams()), t: 365 }]);
    expect(rows[0] instanceof Map).toBe(false);
    expect(typeof rows[0].phi).toBe('number');
    expect(JSON.parse(JSON.stringify(rows[0]))).toHaveProperty('phi');
  });

  test('an out-of-range series length is rejected quickly instead of trapping', () => {
    const b4 = b4Wasm(b4Params());
    for (const bad of [-1, 4294967295, 1e9]) {
      const started = Date.now();
      let caught;
      try { Rust.calculate_b4_series(b4, bad); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toMatch(/out of range/);
      expect(Date.now() - started).toBeLessThan(1000);
    }
    // the length the UI actually requests still works
    expect(Rust.calculate_b4_series(b4, 10000)).toHaveLength(10001);
  });

  test('get_memory_usage reports real memory rather than the old 1 MiB placeholder', () => {
    const bytes = Rust.get_memory_usage();
    expect(bytes).not.toBe(1048576);
    expect(bytes).toBeGreaterThan(1048576);
    expect(bytes % 65536).toBe(0);
  });
});
