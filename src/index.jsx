import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-300.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './index.css';
import App from './App';
import { WORKSPACES, preloadModel, workspaceFromUrl } from './workspaces';
import { readUrl } from './state/urlSync';

const root = ReactDOM.createRoot(document.getElementById('root'));

/*
 * Resolve the first workspace before the first render.
 *
 * `React.lazy` suspends on its first attempt even when the module is already in
 * the module graph, and React deliberately keeps a committed suspense fallback
 * for at least its own `FALLBACK_THROTTLE_MS` (300 ms) so a spinner cannot flash.
 * Measured with scripts/benchmark.mjs before this: the shell rendered at ~20 ms
 * and the workspace only at ~330 ms — a flat ~300 ms gap that did not change when
 * the chunks came from the HTTP cache instead of the network, which is what
 * identified it as the throttle rather than the fetch (scenario
 * `first-load-single`; render marks showed the tree rendering at 30 ms but
 * committing at 330 ms). Resolving the module first removes the suspension, so the
 * first commit already contains the workspace. The calculation workspace has a
 * second lazy step of its own (`SingleCalculationDashboard` loads one of six model
 * views), which is why `preloadModel` exists as well.
 *
 * The other workspaces stay lazy: switching to one is a user action, where the
 * spinner is the right feedback and the throttle cannot be felt.
 */
const mode = workspaceFromUrl();
const initialModel = mode === 'single' ? (readUrl().model ?? 'aci209') : null;

Promise.all([
  WORKSPACES[mode](),
  initialModel ? preloadModel(initialModel) : undefined,
]).then(
  ([workspace]) => root.render(
    <React.StrictMode>
      <App initialWorkspace={{ mode, Component: workspace.default }} />
    </React.StrictMode>
  ),
  // A failed preload must degrade to the lazy path (and its spinner), not to an
  // empty page: App retries the same import, and a real failure is reported by the
  // error boundary instead of a blank document.
  () => root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);
