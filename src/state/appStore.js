import { useSyncExternalStore } from 'react';
import { detectLocale, isLocale } from '../i18n/locales';
import { workspaceFromUrl } from '../workspaces';

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
const SETS_KEY = 'creep-lab:parameterSets';
// Exported for the locale tests, which assert the round trip by the real key and
// the real loader rather than by a copy of either.
export const LOCALE_KEY = 'creep-lab:locale';
const VERSION_KEY = 'creep-lab:storeVersion';
const STORE_VERSION = 1;

/**
 * Both entries are user data that can outlive a schema change, so a shape the app
 * no longer expects has to be dropped rather than trusted: a `parameterSets` entry
 * that is a string (an older layout, or a hand-edited localStorage) used to reach
 * `saved.map` and take the whole calculation workspace down with it.
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function storeVersion() {
  try {
    return Number(globalThis.localStorage?.getItem(VERSION_KEY) ?? STORE_VERSION);
  } catch {
    return STORE_VERSION;
  }
}

function loadParams() {
  try {
    if (storeVersion() !== STORE_VERSION) return {};
    const raw = globalThis.localStorage?.getItem(PARAMS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!isPlainObject(parsed)) return {};
    const clean = {};
    for (const [modelId, params] of Object.entries(parsed)) {
      if (isPlainObject(params)) clean[modelId] = params;
    }
    return clean;
  } catch {
    return {}; // a corrupt entry must not stop the app from starting
  }
}

function loadSets() {
  try {
    if (storeVersion() !== STORE_VERSION) return {};
    const raw = globalThis.localStorage?.getItem(SETS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!isPlainObject(parsed)) return {};
    const clean = {};
    for (const [modelId, sets] of Object.entries(parsed)) {
      if (!Array.isArray(sets)) continue;
      const kept = sets.filter((set) => isPlainObject(set) && typeof set.name === 'string' && isPlainObject(set.params));
      if (kept.length) clean[modelId] = kept;
    }
    return clean;
  } catch {
    return {};
  }
}

function persistSets(parameterSets) {
  try {
    globalThis.localStorage?.setItem(VERSION_KEY, String(STORE_VERSION));
    globalThis.localStorage?.setItem(SETS_KEY, JSON.stringify(parameterSets));
  } catch {
    // storage can be full or blocked; the app still works without persistence
  }
}

function persistParams(paramsByModel) {
  try {
    globalThis.localStorage?.setItem(VERSION_KEY, String(STORE_VERSION));
    globalThis.localStorage?.setItem(PARAMS_KEY, JSON.stringify(paramsByModel));
  } catch {
    // storage can be full or blocked; the app still works without persistence
  }
}

function persistLocale(locale) {
  try {
    globalThis.localStorage?.setItem(LOCALE_KEY, locale);
  } catch {
    // storage can be full or blocked; the app still works without persistence
  }
}

/**
 * The visitor's language: an explicit choice if they made one, otherwise what the
 * browser asks for. The two are kept distinct on purpose — a detected default is
 * not written back, so someone whose browser is Chinese but who switched to English
 * does not get flipped back on their next visit by the detection re-running.
 */
export function loadLocale() {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // fall through to detection
  }
  return detectLocale();
}

const initialState = {
  // The workspace the URL names, not always the default: the entry point resolves
  // that workspace before mounting, so the first render has to want it. Reading it
  // here rather than in `initUrlSync`'s effect is what stops the app from mounting
  // the default workspace and swapping to the requested one after a render (see
  // index.jsx for what that swap cost). An absent or unknown `?mode=` is the
  // default, exactly as in urlSync.readUrl.
  mode: workspaceFromUrl(),
  /** the interface language; see i18n/locales.js for why the id is not the html lang */
  locale: loadLocale(),
  engine: 'rust',
  /** the model the app is working with: drives the calculation and the docs */
  model: 'aci209',
  /** modelId -> the parameters the user has actually edited */
  paramsByModel: loadParams(),
  /** modelId -> [{ name, params }] named parameter sets the user saved */
  parameterSets: loadSets(),
  /** the batch pipeline's dataset and view settings, per the fields below */
  batch: {
    modelId: 'aci209',
    /** Invalidates async reads/computations after a confirmed URL dataset reset. */
    generation: 0,
    rows: [],
    headers: [],
    issues: [],
    fileName: '',
    xKey: '',
    yKey: 'result_J_GPa',
    chartType: 'scatter',
    /** parsed rows waiting for the user to map missing columns */
    pendingRows: [],
    /** [{ field, source }] for the columns the file does not name as the model does */
    mapping: [],
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

/**
 * Set the live language without remembering it. Used by the URL sync, so that
 * opening someone's `?lang=zh` link shows Chinese now without quietly rewriting the
 * reader's own preference — which is what `setLocale` is for, and why the two are
 * separate functions rather than one with a flag.
 */
export function applyLocale(locale) {
  if (isLocale(locale) && state.locale !== locale) set({ locale });
}

/** Switch the interface language and remember the choice. */
export function setLocale(locale) {
  if (!isLocale(locale) || state.locale === locale) return;
  persistLocale(locale);
  set({ locale });
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

/** Save the given parameters under a name; saving an existing name replaces it. */
export function saveParameterSet(modelId, name, params) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = state.parameterSets[modelId] ?? [];
  const next = [...existing.filter((set) => set.name !== trimmed), { name: trimmed, params }];
  const parameterSets = { ...state.parameterSets, [modelId]: next };
  persistSets(parameterSets);
  set({ parameterSets });
}

export function deleteParameterSet(modelId, name) {
  const next = (state.parameterSets[modelId] ?? []).filter((set) => set.name !== name);
  const parameterSets = { ...state.parameterSets, [modelId]: next };
  persistSets(parameterSets);
  set({ parameterSets });
}

/** Load a saved set into the model's parameters, as if the user had typed it. */
export function loadParameterSet(modelId, name) {
  const found = (state.parameterSets[modelId] ?? []).find((set) => set.name === name);
  if (found) saveModelParams(modelId, { ...found.params });
}

/**
 * Forget the model's edits so it falls back to its own defaults. Needed once
 * parameters persist: without it there is no way back to the shipped values.
 */
export function resetModelParams(modelId) {
  const paramsByModel = { ...state.paramsByModel };
  delete paramsByModel[modelId];
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
    globalThis.localStorage?.removeItem(SETS_KEY);
    globalThis.localStorage?.removeItem(LOCALE_KEY);
  } catch {
    // nothing to clear
  }
  state = {
    ...initialState,
    paramsByModel: {},
    parameterSets: {},
    // Re-detect rather than assume: the initial state was built when the module was
    // first imported, so its locale is the one from the previous test's storage.
    locale: detectLocale(),
  };
  // Listeners get the new state, exactly as `set` above promises: the URL sync's
  // subscriber reads `state.mode`, so calling them with nothing threw a TypeError
  // whenever the app was mounted.
  listeners.forEach((listener) => listener(state));
}

export function useAppSelector(selector) {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(initialState));
}
