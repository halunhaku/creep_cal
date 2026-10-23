import { applyLocale, getState, setEngine, setMode, setModel, subscribe, updateBatch } from './appStore';
import { DEFAULT_LOCALE, LOCALES } from '../i18n/locales';
import { translate } from '../i18n';
import { MODELS as BATCH_MODELS } from '../components/batchModels';

/**
 * Keeps the navigation state in the URL.
 *
 * The audit's P0-3: the workspace, model and kernel were memory-only, so nothing
 * could be linked to, Back left the app entirely, and a refresh started over.
 *
 * Only navigation lives in the URL — the workspace, the model, the kernel, and the
 * language. Parameters and datasets deliberately do not: a dataset cannot be
 * serialised, and a full parameter set in a query string is what step 2's named
 * parameter sets are for. Edited parameters are persisted separately (see
 * appStore), so a refresh does not wipe them either.
 *
 * Defaults are omitted, so a plain visit leaves the URL clean.
 */
const MODES = new Set(['single', 'batch', 'docs']);
const MODELS = new Set(['aci209', 'mc2010', 'b4', 'b4s', 'gl2000', 'aashto']);
const KERNELS = new Set(['rust', 'js']);
const LOCALE_IDS = new Set(LOCALES);
const DEFAULTS = { mode: 'single', model: 'aci209', engine: 'rust', locale: DEFAULT_LOCALE };
const DEFAULT_MODEL_BY_MODE = { single: 'aci209', batch: 'aci209', docs: 'aci209' };

const KEYS = { mode: 'mode', model: 'model', engine: 'kernel', locale: 'lang' };

export function readUrl(search) {
  const query = new URLSearchParams(search ?? (typeof window === 'undefined' ? '' : window.location.search));
  const valid = { mode: MODES, model: MODELS, engine: KERNELS, locale: LOCALE_IDS };
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
    const value = field === 'model' && state.mode === 'batch'
      ? (state.batch?.modelId ?? state.model)
      : state[field];
    const defaultValue = field === 'model'
      ? DEFAULT_MODEL_BY_MODE[state.mode]
      : DEFAULTS[field];
    // A field the caller did not supply is "no opinion", not "the default is
    // missing": writing it would put `?lang=undefined` in the address bar, which is
    // what adding `locale` to KEYS did to every partial state object in the tests.
    if (value === undefined || value === null) continue;
    if (value !== defaultValue) query.set(key, value);
  }
  const value = query.toString();
  return value ? `?${value}` : '';
}

/**
 * The parts of the store the URL describes, as one comparable string. Used to decide
 * whether a store write is a *navigation* change worth writing back.
 *
 * @param {object} state
 * @returns {string}
 */
function urlState(state) {
  return [state.mode, state.model, state.engine, state.batch?.modelId, state.locale].join('|');
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
    const nextMode = parsed.mode ?? (complete ? DEFAULTS.mode : getState().mode);
    const nextModel = parsed.model ?? (complete ? DEFAULT_MODEL_BY_MODE[nextMode] : undefined);
    const nextEngine = parsed.engine ?? (complete ? DEFAULTS.engine : undefined);
    // Unlike the three above, an absent `lang` is not read as "the default" — not
    // even on a Back/Forward. The language is the reader's preference first and a
    // shareable link second: a Chinese reader who presses Back to a URL that never
    // named a language should not watch the interface turn English under them.
    const nextLocale = parsed.locale;
    const batch = getState().batch;
    const changesBatchModel = nextMode === 'batch' && nextModel !== undefined && batch.modelId !== nextModel;
    const hasDataset = batch.rows.length || batch.pendingRows.length || batch.fileName;
    // URL navigation cannot reuse the mounted workspace's recomputation handler.
    // Never discard an upload/mapping (including a file still parsing) silently.
    const allowBatchReset = !changesBatchModel || !hasDataset || window.confirm(translate(nextLocale ?? getState().locale, 'batch.confirmUrlModel', {
      model: BATCH_MODELS.find((model) => model.id === nextModel)?.name ?? nextModel,
    }));

    applyingFromUrl = true;
    if (parsed.mode !== undefined || complete) setMode(nextMode);
    if (nextModel !== undefined) {
      if (nextMode === 'batch') {
        if (changesBatchModel && allowBatchReset) {
          // Invalidate callbacks even if navigation later returns to the same
          // model: checking only modelId would let an old Worker resurrect data.
          updateBatch({
            generation: batch.generation + 1,
            modelId: nextModel, rows: [], headers: [], issues: [], fileName: '',
            xKey: '', yKey: '', pendingRows: [], mapping: [],
          });
        }
      } else {
        setModel(nextModel);
      }
    }
    if (nextEngine !== undefined) setEngine(nextEngine);
    // Back/Forward and a fresh load both come through here. Neither one is the
    // reader expressing a preference, so neither persists: a `?lang=zh` link shows
    // Chinese without permanently changing what an English reader next opens.
    if (nextLocale) applyLocale(nextLocale);
    applyingFromUrl = false;
    if (!allowBatchReset) {
      // Cancelling keeps both the current data and an honest, shareable URL.
      window.history.replaceState(null, '', `${window.location.pathname}${buildSearch(getState())}${window.location.hash}`);
    }
    // The URL now describes this mode, so the next in-workspace change replaces
    // rather than pushing a second entry for the same workspace.
    previousMode = getState().mode;
  };

  apply();

  const unsubscribe = subscribe((state, previous) => {
    if (applyingFromUrl) return;
    /*
     * Write only when the URL-relevant state moved.
     *
     * The store also carries things the URL does not describe — the kernel's load
     * failure, the retry counter, persisted parameters — and a subscriber that
     * re-derived the query string on any store write ended up rewriting the address
     * on writes that had nothing to say about it. That is how a deep link that spells
     * out a default (`?mode=single&model=b4&kernel=js`) lost its explicit `?mode`:
     * the kernel fallback wrote `?kernel=js` from the same partial state, which
     * turned the rest of the address into this mount's assumptions instead of the
     * user's URL.
     */
    if (previous && urlState(previous) === urlState(state)) return;
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
