import React, { lazy, Suspense, useEffect } from 'react';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/ui/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import { useT } from './i18n';
import { useDocumentLanguage } from './i18n/useDocumentLanguage';
import { setMode, useAppSelector } from './state/appStore';
import { initUrlSync } from './state/urlSync';
import { WORKSPACES } from './workspaces';

// One lazy component per workspace, built from the shared loader map so the entry
// point — which resolves the first workspace before mounting — cannot drift from
// the modules App switches between at runtime.
const WORKSPACE_COMPONENTS = {
  single: lazy(WORKSPACES.single),
  batch: lazy(WORKSPACES.batch),
  docs: lazy(WORKSPACES.docs),
};

/**
 * @param {{ initialWorkspace?: { mode: string, Component: React.ComponentType } }} props
 *   `initialWorkspace` is the workspace the entry point already resolved. It is
 *   rendered directly *only* while it is the active workspace: every later switch
 *   goes through the lazy components above, which is where a spinner belongs.
 */
function App({ initialWorkspace }) {
  // Held in the store rather than local state: each workspace unmounts when you
  // leave it, so anything the user typed or loaded has to live above them. The
  // store is also what step 2 will sync with the URL.
  const activeMode = useAppSelector((state) => state.mode);
  const t = useT();
  const Workspace = initialWorkspace?.mode === activeMode ? initialWorkspace.Component : WORKSPACE_COMPONENTS[activeMode];

  // The language the store holds is also the language of <html>, <title> and the
  // description; see the hook for why those three are one decision.
  useDocumentLanguage();

  // Reads the workspace, model, kernel and language out of the URL, keeps them in
  // step with Back/Forward, and writes changes back.
  useEffect(initUrlSync, []);

  return (
    <Layout 
      activeMode={activeMode} 
      onModeChange={setMode}
      onOpenDocs={() => setMode('docs')}
    >
      {/* Keyed by mode so a crash in one workspace cannot trap the others:
          switching tabs remounts the boundary and clears the error state. */}
      <ErrorBoundary key={activeMode}>
        <Suspense fallback={<LoadingSpinner message={t('loading.workspace')} />}>
          <Workspace />
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

export default App;
