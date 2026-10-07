const WASM_TIMEOUT_MS = 15000;

let engineModule = null;
let enginePromise = null;

/* ── Kernel status ────────────────────────────────────────────────────────────
 * The workspace header used to show a hardcoded green "WASM ready" badge even
 * while the Rust kernel was failing to load. The calculators publish their real
 * kernel state here and the header subscribes to it.
 *
 * state: 'idle' | 'loading' | 'ready' | 'failed'
 */
let kernelStatus = { engine: null, state: 'idle' };
let kernelFailure = null;
const kernelStatusListeners = new Set();

export function setKernelStatus(next) {
  // A kernel failure is sticky: switching to the JavaScript fallback must not
  // erase the fact that the Rust kernel is broken (it clears only once a Rust
  // load succeeds).
  if (next.state === 'failed') kernelFailure = next.detail ?? 'unknown error';
  if (next.state === 'ready' && next.engine === 'rust') kernelFailure = null;
  kernelStatus = { ...kernelStatus, ...next, failure: kernelFailure };
  kernelStatusListeners.forEach((listener) => listener());
}

export function subscribeKernelStatus(listener) {
  kernelStatusListeners.add(listener);
  return () => { kernelStatusListeners.delete(listener); };
}

export function getKernelStatus() {
  return kernelStatus;
}

export async function loadCreepEngine() {
  if (engineModule) return engineModule;

  if (!enginePromise) {
    enginePromise = (async () => {
      const wasmPromise = import('../wasm-pkg/creep_calculator_engine.js');
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`WASM load timed out after ${WASM_TIMEOUT_MS}ms`)), WASM_TIMEOUT_MS);
      });

      const wasm = await Promise.race([wasmPromise, timeoutPromise]);
      await wasm.default();
      engineModule = wasm;
      return engineModule;
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }

  return enginePromise;
}

export function appendFeedLog(setFeedLogs, message, type = 'info') {
  setFeedLogs((prev) => {
    const last = prev[prev.length - 1];
    if (last?.message === message && last?.type === type) return prev;
    return [...prev.slice(-9), { time: new Date().toLocaleTimeString(), message, type }];
  });
}

/**
 * Turn anything that can be thrown across the wasm boundary into a readable string.
 *
 * Rust `#[wasm_bindgen]` functions declared as `Result<_, JsValue>` used to throw
 * `JsValue::from_str(...)`, i.e. a bare JS *string* rather than an `Error`, so
 * `error.message` was `undefined` and the UI logged "Calculation failed: undefined".
 * The committed `src/wasm-pkg/*.wasm` now throws real `js_sys::Error` values — the
 * "validation errors cross the boundary as real Error objects" case in
 * `kernelParity.test.js` asserts exactly that — but the normalisation stays: a
 * future rebuild that regresses it would otherwise put "undefined" back in the log.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  if (error === null || error === undefined) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && typeof error.message === 'string' && error.message) return error.message;
  return String(error);
}

/* ── Parameter contracts ──────────────────────────────────────────────────────
 *
 * The wasm boundary used to be an untyped `any`, and the four kernels do not
 * even agree on a naming convention: ACI takes `H` / `VS` / `curingType` (with
 * `#[serde(rename)]` on the Rust side) while MC2010 and B4 take snake_case
 * (`t_prime`, `cement_type`, ...). A typo therefore only failed at runtime with
 * e.g. `missing field \`t_prime\``. The builders below are the single place that
 * knows each kernel's exact shape; they also fail fast with a readable message.
 */

/**
 * @typedef {object} Aci209WasmParams
 * @property {'moist'|'steam'} curingType
 * @property {number} t0  age at loading (days)
 * @property {number} H   relative humidity (%)
 * @property {number} VS  volume-to-surface ratio (mm)
 * @property {number} slump
 * @property {number} fineAggregate
 * @property {number} airContent
 *
 * @typedef {object} Mc2010WasmParams
 * @property {number} fcm @property {number} rh relative humidity (%)
 * @property {number} t0 @property {number} ac cross-section area (mm²)
 * @property {number} u drying perimeter (mm)
 * @property {number} t constant curing temperature (°C) — *not* an age
 * @property {string} cement_type @property {number} sigma
 *
 * @typedef {object} B4WasmParams
 * @property {number} t0 @property {number} t_prime
 * @property {number} t_cur @property {number} t_sh @property {number} t_c
 * @property {number} h relative humidity (%)
 * @property {number} fc @property {number} v_s
 * @property {number} c @property {number} w_c @property {number} a_c
 * @property {string} cement_type @property {string} aggregate_type
 * @property {string} specimen_shape
 * @property {number} retarder @property {number} fly_ash
 * @property {number} superplasticizer @property {number} silica_fume
 * @property {number} air_entraining_agent @property {number} water_reducer
 *
 * @typedef {object} B4sWasmParams
 * @property {number} t0 @property {number} t_prime
 * @property {number} t_cur @property {number} t_sh @property {number} t_c
 * @property {number} h @property {number} fc @property {number} v_s
 * @property {string} cement_type @property {string} aggregate_type
 * @property {string} specimen_shape
 */

function assertContract(kernel, payload, expectedKeys) {
  const actual = Object.keys(payload);
  // A missing UI parameter arrives as `undefined` rather than as an absent key,
  // so both have to be treated as missing.
  const missing = expectedKeys.filter((key) => !actual.includes(key) || payload[key] === undefined);
  if (missing.length) {
    throw new Error(`${kernel} kernel parameter mismatch: missing ${missing.join(', ')} (got ${actual.join(', ')})`);
  }
  const unexpected = actual.filter((key) => !expectedKeys.includes(key));
  if (unexpected.length) {
    throw new Error(`${kernel} kernel parameter mismatch: unexpected ${unexpected.join(', ')}`);
  }
  return payload;
}

const ACI_KEYS = ['curingType', 't0', 'H', 'VS', 'slump', 'fineAggregate', 'airContent'];
const MC2010_KEYS = ['fcm', 'rh', 't0', 'ac', 'u', 't', 'cement_type', 'sigma'];
const B4_KEYS = [
  't0', 't_prime', 't_cur', 't_sh', 't_c', 'h', 'fc', 'v_s', 'c', 'w_c', 'a_c',
  'cement_type', 'aggregate_type', 'specimen_shape', 'retarder', 'fly_ash',
  'superplasticizer', 'silica_fume', 'air_entraining_agent', 'water_reducer',
];
const B4S_KEYS = [
  't0', 't_prime', 't_cur', 't_sh', 't_c', 'h', 'fc', 'v_s',
  'cement_type', 'aggregate_type', 'specimen_shape',
];
const GL2000_KEYS = ['fcm28', 'h', 'vs', 'tc', 't0', 'cement_type'];
const AASHTO_KEYS = ['fci', 'h', 'vs', 'ti', 'tc'];

/** @param {Record<string, any>} params UI parameters @returns {Aci209WasmParams} */
export function buildAci209Params(params) {
  return assertContract('ACI 209R-92', {
    curingType: params.curingType,
    t0: params.t0,
    H: params.H,
    VS: params.VS,
    slump: params.slump,
    fineAggregate: params.fineAggregate,
    airContent: params.airContent,
  }, ACI_KEYS);
}

/** @param {Record<string, any>} params UI parameters @returns {Mc2010WasmParams} */
export function buildMc2010Params(params) {
  return assertContract('fib MC2010', {
    fcm: params.fcm,
    rh: params.RH,
    t0: params.t0,
    ac: params.Ac,
    u: params.u,
    t: params.T,
    cement_type: params.Cs,
    sigma: params.sigma,
  }, MC2010_KEYS);
}

/** @param {Record<string, any>} params UI parameters @returns {B4WasmParams} */
export function buildB4Params(params) {
  return assertContract('RILEM B4', {
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
  }, B4_KEYS);
}

/** @param {Record<string, any>} params UI parameters @returns {B4sWasmParams} */
export function buildB4sParams(params) {
  return assertContract('RILEM B4s', {
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
  }, B4S_KEYS);
}

/** @param {Record<string, any>} params UI parameters @returns {Gl2000WasmParams} */
export function buildGl2000Params(params) {
  return assertContract('GL2000', {
    fcm28: params.fcm28,
    h: params.h,
    vs: params.vs,
    tc: params.tc,
    t0: params.t0,
    cement_type: params.cementType,
  }, GL2000_KEYS);
}

/** @param {Record<string, any>} params UI parameters @returns {AashtoWasmParams} */
export function buildAashtoParams(params) {
  return assertContract('AASHTO LRFD', {
    fci: params.fci,
    h: params.H,
    vs: params.vs,
    ti: params.ti,
    tc: params.tc,
  }, AASHTO_KEYS);
}
