import React, { lazy, Suspense, useState } from 'react';
import LoadingSpinner from './LoadingSpinner';

const CALCULATORS = {
  aci209: lazy(() => import('./Aci209Calculator')),
  mc2010: lazy(() => import('./Mc2010Calculator')),
  b4: lazy(() => import('./B4Calculator')),
  b4s: lazy(() => import('./B4sCalculator')),
};

export default function SingleCalculationDashboard() {
  const [engine, setEngine] = useState('rust'); // 'rust' | 'js'
  const [algorithm, setAlgorithm] = useState('aci209'); // 'aci209' | 'mc2010' | 'b4' | 'b4s'

  const ActiveComponent = CALCULATORS[algorithm];
  const algorithms = [
    { id: 'aci209', label: 'ACI 209R-92', shortLabel: 'ACI 209' },
    { id: 'mc2010', label: 'fib MC 2010', shortLabel: 'MC 2010' },
    { id: 'b4', label: 'B4', shortLabel: 'B4' },
    { id: 'b4s', label: 'B4S', shortLabel: 'B4S' }
  ];

  const segmentBase = 'rounded px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-150 whitespace-nowrap';

  return (
    <div className="animate-fade-in relative z-10">
      {/* Instrument control bar */}
      <div className="card mb-6 flex flex-col gap-3 p-2 xl:flex-row xl:items-center xl:justify-between">
        {/* Model selection */}
        <div className="flex overflow-x-auto rounded-md border border-line bg-surface-2 p-0.5">
          {algorithms.map((algo, idx) => (
            <button
              key={algo.id}
              onClick={() => setAlgorithm(algo.id)}
              aria-pressed={algorithm === algo.id}
              className={`${segmentBase} ${
                algorithm === algo.id
                  ? 'bg-green-soft font-bold text-green-dark'
                  : 'text-muted hover:bg-surface-3 hover:text-primary'
              }`}
            >
              <span className="mr-1.5 text-faint">MOD-{String(idx + 1).padStart(2, '0')}</span>
              <span className="md:hidden">{algo.shortLabel}</span>
              <span className="hidden md:inline">{algo.label}</span>
            </button>
          ))}
        </div>

        {/* Engine selection */}
        <div className="flex items-center gap-3 px-1 xl:px-2">
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-faint lg:block">
            Kernel
          </span>
          <div className="flex rounded-md border border-line bg-surface-2 p-0.5">
            <button
              onClick={() => setEngine('rust')}
              aria-pressed={engine === 'rust'}
              className={`${segmentBase} ${
                engine === 'rust'
                  ? 'bg-green-soft font-bold text-green-dark'
                  : 'text-muted hover:bg-surface-3 hover:text-primary'
              }`}
            >
              Rust WASM
            </button>
            <button
              onClick={() => setEngine('js')}
              aria-pressed={engine === 'js'}
              className={`${segmentBase} ${
                engine === 'js'
                  ? 'bg-green-soft font-bold text-green-dark'
                  : 'text-muted hover:bg-surface-3 hover:text-primary'
              }`}
            >
              JS Reference
            </button>
          </div>
          <span
            className="hidden h-1.5 w-1.5 rounded-full sm:block"
            style={{
              background: 'var(--green)',
              boxShadow: '0 0 5px var(--green)',
            }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Render the selected calculator */}
      <Suspense fallback={<LoadingSpinner message="Loading model..." />}>
        <ActiveComponent engine={engine} />
      </Suspense>
    </div>
  );
}
