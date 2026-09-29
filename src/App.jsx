import React, { lazy, Suspense, useState } from 'react';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/ui/Layout';
import LoadingSpinner from './components/LoadingSpinner';

const SingleCalculationDashboard = lazy(() => import('./components/SingleCalculationDashboard'));
const BatchCalculator = lazy(() => import('./components/BatchCalculator'));
const DocsPage = lazy(() => import('./components/DocsPage'));

function App() {
  const [activeMode, setActiveMode] = useState('single');

  return (
    <Layout 
      activeMode={activeMode} 
      onModeChange={setActiveMode}
      onOpenDocs={() => setActiveMode('docs')}
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
