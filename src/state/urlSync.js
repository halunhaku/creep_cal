import { getState, setEngine, setMode, setModel, subscribe } from './appStore';

/**
 * Keeps the navigation state in the URL.
 *
 * The audit's P0-3: the workspace, model and kernel were memory-only, so nothing
 * could be linked to, Back left the app entirely, and a refresh started over.
 *
 * Only navigation lives in the URL — the workspace, the model and the kernel.
 * Parameters and datasets deliberately do not: a dataset cannot be serialised,
 * and a full parameter set in a query string is what step 2's named parameter
 * sets are for. Edited parameters are persisted separately (see appStore), so a
 * refresh does not wipe them either.
 *
 * Defaults are omitted, so a plain visit leaves the URL clean.
 */
const MODES = new Set(['single', 'batch', 'docs']);
const MODELS = new Set(['aci209', 'mc2010', 'b4', 'b4s']);
const KERNELS = new Set(['rust', 'js']);
const DEFAULTS = { mode: 'single', model: 'aci209', engine: 'rust' };

const KEYS = { mode: 'mode', model: 'model', engine: 'kernel' };

export function readUrl(search) {
  const query = new URLSearchParams(search ?? (typeof window === 'undefined' ? '' : window.location.search));
  const valid = { mode: MODES, model: MODELS, engine: KERNELS };
  const parsed = {};
  for (const [field, key] of Object.entries(KEYS)) {
    const value = query.get(key);
    if (value && valid[field].has(value)) parsed[field] = value;
  }
  return parsed;
}

export function buildSearch(state) {
  const query = new URLSearchParams();
  for (const [field, key] of Object.entries(KEYS)) {
    if (state[field] !== DEFAULTS[field]) query.set(key, state[field]);
  }
  const value = query.toString();
  return value ? `?${value}` : '';
}

/**
 * Apply the URL to the store, then mirror store changes back into it.
 * Workspace changes push a history entry (so Back moves between workspaces);
 * model and kernel changes replace the current one, because they are selections
 * within a workspace and would otherwise bury the Back button in noise.
 *
 * @returns {() => void} teardown, for tests
 */
export function initUrlSync() {
  if (typeof window === 'undefined') return () => {};

  let applyingFromUrl = false;

  const apply = () => {
    const parsed = readUrl();
    applyingFromUrl = true;
    // Only overwrite what the URL actually specifies; anything absent keeps the
    // value it has (which on first load is the default).
    if (parsed.mode) setMode(parsed.mode);
    if (parsed.model) setModel(parsed.model);
    if (parsed.engine) setEngine(parsed.engine);
    applyingFromUrl = false;
  };

  apply();

  let previousMode = getState().mode;
  const unsubscribe = subscribe((state) => {
    if (applyingFromUrl) return;
    const search = `${buildSearch(state)}${window.location.hash}`;
    if (search === `${window.location.search}${window.location.hash}`) {
      previousMode = state.mode;
      return;
    }
    const method = state.mode === previousMode ? 'replaceState' : 'pushState';
    window.history[method](null, '', `${window.location.pathname}${search}`);
    previousMode = state.mode;
  });

  const onPopState = () => apply();
  window.addEventListener('popstate', onPopState);

  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPopState);
  };
}
