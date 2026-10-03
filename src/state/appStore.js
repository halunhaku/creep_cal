import { useSyncExternalStore } from 'react';

/**
 * State that must outlive a workspace switch.
 *
 * App renders exactly one workspace at a time, so anything a user typed or
 * loaded was destroyed by leaving the tab: an edited parameter reverted to its
 * default, and a parsed dataset plus its result matrix disappeared. Everything
 * below is state the user would expect to still be there on return.
 *
 * Deliberately tiny (subscribe + getSnapshot + immutable set) rather than a
 * state library: the app has one store, one consumer per workspace, and no
 * server data. Step 2's URL sync will read `mode` and the selections from here.
 *
 * Transient state stays local to the component that owns it — run results and
 * timing, dirty/comparison flags, `isProcessing`, parse errors. Run results
 * recompute in a few milliseconds when the workspace remounts, so they are not
 * worth carrying; a parsed dataset cannot be recreated without the file, so it
 * is kept.
 *
 * Selectors MUST return a primitive or a stable reference (a sub-object of the
 * state), never a fresh object — useSyncExternalStore compares snapshots with
 * Object.is and will loop otherwise.
 */
const PARAMS_KEY = 'creep-lab:paramsByModel';

/** Parameters survive a reload; the URL carries navigation only. */
function loadParams() {
  try {
    const raw = globalThis.localStorage?.getItem(PARAMS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {}; // a corrupt entry must not stop the app from starting
  }
}

function persistParams(paramsByModel) {
  try {
    globalThis.localStorage?.setItem(PARAMS_KEY, JSON.stringify(paramsByModel));
  } catch {
    // storage can be full or blocked; the app still works without persistence
  }
}

const initialState = {
  mode: 'single',
  engine: 'rust',
  /** the model the app is working with: drives the calculation and the docs */
  model: 'aci209',
  /** modelId -> the parameters the user has actually edited */
  paramsByModel: loadParams(),
  /** the batch pipeline's dataset and view settings, per the fields below */
  batch: {
    modelId: 'b4',
    rows: [],
    headers: [],
    issues: [],
    fileName: '',
    xKey: '',
    yKey: 'result_J_GPa',
    chartType: 'scatter',
  },
};

let state = initialState;
const listeners = new Set();

export function getState() {
  return state;
}

/** @param {(state: object) => void} listener */
export function subscribe(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function set(patch) {
  state = { ...state, ...patch };
  // Listeners receive the new state: subscribers that need to compare (the URL
  // sync) would otherwise have to call getState() again, and a listener written
  // as (state) => ... silently gets undefined if this forwards nothing.
  listeners.forEach((listener) => listener(state));
}

export function setMode(mode) {
  if (state.mode !== mode) set({ mode });
}

export function setEngine(engine) {
  if (state.engine !== engine) set({ engine });
}

export function setModel(model) {
  if (state.model !== model) set({ model });
}

/** Persist one model's parameters; the other models keep theirs untouched. */
export function saveModelParams(modelId, params) {
  const paramsByModel = { ...state.paramsByModel, [modelId]: params };
  persistParams(paramsByModel);
  set({ paramsByModel });
}

export function updateBatch(patch) {
  set({ batch: { ...state.batch, ...patch } });
}

/** Test seam: restore the initial state between cases. */
export function resetStore() {
  try {
    globalThis.localStorage?.removeItem(PARAMS_KEY);
  } catch {
    // nothing to clear
  }
  state = { ...initialState, paramsByModel: {} };
  listeners.forEach((listener) => listener());
}

export function useAppSelector(selector) {
  return useSyncExternalStore(subscribe, () => selector(state));
}
