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
const initialState = {
  mode: 'single',
  engine: 'rust',
  algorithm: 'aci209',
  /** modelId -> the parameters the user has actually edited */
  paramsByModel: {},
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

export function subscribe(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function setMode(mode) {
  if (state.mode !== mode) set({ mode });
}

export function setEngine(engine) {
  if (state.engine !== engine) set({ engine });
}

export function setAlgorithm(algorithm) {
  if (state.algorithm !== algorithm) set({ algorithm });
}

/** Persist one model's parameters; the other models keep theirs untouched. */
export function saveModelParams(modelId, params) {
  set({ paramsByModel: { ...state.paramsByModel, [modelId]: params } });
}

export function updateBatch(patch) {
  set({ batch: { ...state.batch, ...patch } });
}

/** Test seam: restore the initial state between cases. */
export function resetStore() {
  state = initialState;
  listeners.forEach((listener) => listener());
}

export function useAppSelector(selector) {
  return useSyncExternalStore(subscribe, () => selector(state));
}
