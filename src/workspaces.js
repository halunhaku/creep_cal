/**
 * The three workspaces, in one place.
 *
 * They live here rather than inline in `App.jsx` because the entry point needs
 * the same loaders: it resolves the first workspace *before* React renders, which
 * is the only way to avoid a `React.lazy` suspension on the first screen. See
 * `index.jsx` for the measurement behind that.
 *
 * The keys are the `?mode=` values, and `urlSync` keeps its own set in step with
 * `readUrl`; `workspaceFromUrl` below is the single URL-decoding rule both the
 * store and the entry point use.
 */
export const WORKSPACES = {
  single: () => import('./components/SingleCalculationDashboard'),
  batch: () => import('./components/BatchCalculator'),
  docs: () => import('./components/DocsPage'),
};

/**
 * The calculation workspace's six model views, lazily loaded one at a time. They
 * live here for the same reason the workspaces do: the entry point resolves the
 * first one before mounting, and `SingleCalculationDashboard` must build its lazy
 * components from the same map so the two cannot name different modules.
 */
export const MODEL_CALCULATORS = {
  aci209: () => import('./components/Aci209Calculator'),
  mc2010: () => import('./components/Mc2010Calculator'),
  b4: () => import('./components/B4Calculator'),
  b4s: () => import('./components/B4sCalculator'),
  gl2000: () => import('./components/Gl2000Calculator'),
  aashto: () => import('./components/AashtoCalculator'),
};

/*
 * The model view the entry point resolved, keyed by model id.
 *
 * A React.lazy component suspends on its first render even when its module is
 * already loaded, and React then holds the committed fallback for its 300 ms
 * `FALLBACK_THROTTLE_MS`. Resolving the module is therefore not enough on its own:
 * the resolved component has to be rendered *directly*, which is what this map lets
 * the dashboard do (the lookup is a plain property read, so the hooks lint does not
 * have to guess whether a component is being created during render — a function
 * call there reads as exactly that). Only the entry point writes it, and only for
 * the view the first render will show.
 */
export const preloadedModels = Object.create(null);

/**
 * Resolve one model view and keep the component for the first render.
 * @param {string} modelId
 * @returns {Promise<React.ComponentType | undefined>}
 */
export async function preloadModel(modelId) {
  const load = MODEL_CALCULATORS[modelId];
  if (!load) return undefined;
  const module = await load();
  preloadedModels[modelId] = module.default;
  return module.default;
}

export const DEFAULT_WORKSPACE = 'single';

/**
 * The workspace a URL asks for, falling back exactly like `urlSync.readUrl`
 * (an unknown or absent `?mode=` is "no opinion", which means the default).
 *
 * Reads `window.location` by default, and returns the default when there is no
 * window, so importing this module in a test runner is not a side effect.
 *
 * @param {string} [search]
 * @returns {'single' | 'batch' | 'docs'}
 */
export function workspaceFromUrl(search = typeof window === 'undefined' ? '' : window.location.search) {
  const mode = new URLSearchParams(search ?? '').get('mode');
  return Object.hasOwn(WORKSPACES, mode) ? mode : DEFAULT_WORKSPACE;
}
