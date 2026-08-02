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
    { id: 'b4', label: 'B4 MODEL', shortLabel: 'B4' },
    { id: 'b4s', label: 'B4S MODEL', shortLabel: 'B4S' }
  ];

  const pillBase = "px-3 py-2 rounded-full text-[10px] font-label uppercase tracking-[0.08em] border border-transparent transition-all duration-200 flex-1 xl:flex-none whitespace-nowrap flex items-center justify-center gap-1.5 md:px-5 md:py-2.5 md:text-xs md:tracking-[0.12em]";

  return (
    <div className="animate-fade-in relative z-10 w-full">
      {/* Top Controller Bar — pill group */}
      <div className="mb-6 card card-hoverable p-2 md:mb-8 md:p-3 flex flex-col xl:flex-row gap-2 md:gap-3 items-stretch xl:items-center">
        {/* Algorithm Selection — pill group */}
        <div className="flex w-full overflow-x-auto p-0.5 bg-surface-soft rounded-full border border-line/50 xl:w-auto">
          {algorithms.map((algo) => (
            <button
              key={algo.id}
              onClick={() => setAlgorithm(algo.id)}
              className={`${pillBase} ${
                algorithm === algo.id 
                  ? 'bg-green text-white border-green shadow-sm font-semibold'
                  : 'text-muted hover:text-primary hover:bg-green-soft/50 hover:border-green-border/50'
              }`}
            >
              <span className="md:hidden">{algo.shortLabel}</span>
              <span className="hidden md:inline">{algo.label}</span>
            </button>
          ))}
        </div>

        {/* Engine Selection — pill group */}
        <div className="flex w-full p-0.5 bg-surface-soft rounded-full border border-line/50 xl:w-auto">
          <button
            onClick={() => setEngine('rust')}
            className={`${pillBase} ${
              engine === 'rust'
                ? 'bg-green text-white border-green shadow-sm font-semibold'
                : 'text-muted hover:text-primary hover:bg-green-soft/50 hover:border-green-border/50'
            }`}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">memory</span>
            <span className="md:hidden">Rust</span>
            <span className="hidden md:inline">RUST KERNEL</span>
          </button>
          <button
            onClick={() => setEngine('js')}
            className={`${pillBase} ${
              engine === 'js'
                ? 'bg-green text-white border-green shadow-sm font-semibold'
                : 'text-muted hover:text-primary hover:bg-green-soft/50 hover:border-green-border/50'
            }`}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">javascript</span>
            <span className="md:hidden">JS</span>
            <span className="hidden md:inline">STANDARD JS</span>
          </button>
        </div>
      </div>

      {/* Render the selected calculator */}
      <Suspense fallback={<LoadingSpinner message="Loading model..." />}>
        <ActiveComponent engine={engine} />
      </Suspense>
    </div>
  );
}
