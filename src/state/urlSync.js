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
const SETTERS = { mode: setMode, model: setModel, engine: setEngine };

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
 * `complete` is what separates the first load from a Back/Forward: an entry the
 * URL omits means *the default* (buildSearch leaves defaults out), not "whatever
 * is on screen". Reading it as "no information" made Back from ?mode=batch to /
 * do nothing at all — the address bar said the default workspace while the batch
 * workspace stayed on screen — and the next selection then wrote ?mode=batch back
 * into the URL the user had just backed out of.
 *
 * @returns {() => void} teardown, for tests
 */
export function initUrlSync() {
  if (typeof window === 'undefined') return () => {};

  let applyingFromUrl = false;
  let previousMode = getState().mode;

  const apply = (complete = false) => {
    const parsed = readUrl();
    applyingFromUrl = true;
    for (const field of Object.keys(KEYS)) {
      const next = parsed[field] ?? (complete ? DEFAULTS[field] : undefined);
      if (next !== undefined) SETTERS[field](next);
    }
    applyingFromUrl = false;
    // The URL now describes this mode, so the next in-workspace change replaces
    // rather than pushing a second entry for the same workspace.
    previousMode = getState().mode;
  };

  apply();

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

  const onPopState = () => apply(true);
  window.addEventListener('popstate', onPopState);

  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPopState);
  };
}
