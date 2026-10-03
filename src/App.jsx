import React, { lazy, Suspense, useEffect } from 'react';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/ui/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import { setMode, useAppSelector } from './state/appStore';
import { initUrlSync } from './state/urlSync';

const SingleCalculationDashboard = lazy(() => import('./components/SingleCalculationDashboard'));
const BatchCalculator = lazy(() => import('./components/BatchCalculator'));
const DocsPage = lazy(() => import('./components/DocsPage'));

function App() {
  // Held in the store rather than local state: each workspace unmounts when you
  // leave it, so anything the user typed or loaded has to live above them. The
  // store is also what step 2 will sync with the URL.
  const activeMode = useAppSelector((state) => state.mode);

  // Reads the workspace, model and kernel out of the URL, keeps them in step with
  // Back/Forward, and writes changes back.
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
        <Suspense fallback={<LoadingSpinner message="Loading workspace..." />}>
          {activeMode === 'single' && <SingleCalculationDashboard />}
          {activeMode === 'batch' && <BatchCalculator />}
          {activeMode === 'docs' && <DocsPage />}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

export default App;
