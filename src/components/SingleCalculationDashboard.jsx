import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import LoadingSpinner from './LoadingSpinner';

const CALCULATORS = {
  aci209: lazy(() => import('./Aci209Calculator')),
  mc2010: lazy(() => import('./Mc2010Calculator')),
  b4: lazy(() => import('./B4Calculator')),
  b4s: lazy(() => import('./B4sCalculator')),
};

const MODELS = [
  { id:'aci209', index:'01', name:'ACI 209R-92', type:'Empirical · Design', note:'Established correction-factor method', range:'Normal-strength concrete' },
  { id:'mc2010', index:'02', name:'fib MC 2010', type:'Code-based · Nonlinear', note:'Basic and drying creep components', range:'20–130 MPa' },
  { id:'b4', index:'03', name:'RILEM Model B4', type:'Composition-based · Long-term', note:'Mix proportions and staged temperature', range:'15–70 MPa' },
  { id:'b4s', index:'04', name:'RILEM Model B4s', type:'Strength-based · Preliminary', note:'No mix proportions required', range:'15–70 MPa' },
];

export default function SingleCalculationDashboard() {
  const [engine, setEngine] = useState('rust');
  const [algorithm, setAlgorithm] = useState('aci209');
  const ActiveComponent = CALCULATORS[algorithm];
  const active = MODELS.find((model) => model.id === algorithm);
  const activeModelRef = useRef(null);
  // Stable identity: ModelCalculator keeps this in a ref and must not re-run its
  // kernel-loading effect on every parent render.
  const handleEngineFallback = useCallback(() => setEngine('js'), []);

  useEffect(() => {
    const element = activeModelRef.current;
    const scroller = element?.parentElement;
    if (element && scroller) scroller.scrollLeft = element.offsetLeft - (scroller.clientWidth - element.clientWidth) / 2;
  }, [algorithm]);

  return (
    <div className="animate-fade-in">
      <header className="mb-6 flex flex-col gap-2 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow">Calculation workspace</div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-primary md:text-[28px]">Time-dependent concrete analysis</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Select a prediction model, define calibrated inputs, then explicitly calculate the complete 10,000-day response.</p>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">Float64 · 0–10,000 days</div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[216px_minmax(0,1fr)]">
        <aside className="workbench-panel overflow-hidden xl:sticky xl:top-[88px]">
          <div className="border-b border-line px-3.5 py-3"><div className="eyebrow">Prediction model</div></div>
          <div className="flex gap-1 overflow-x-auto p-2 xl:block xl:space-y-1">
            {MODELS.map((model) => {
              const selected = model.id === algorithm;
              return (
                <button
                  key={model.id}
                  ref={selected ? activeModelRef : null}
                  onClick={() => setAlgorithm(model.id)}
                  aria-pressed={selected}
                  className={`relative min-w-[190px] rounded-md px-3 py-3 text-left transition-colors xl:min-w-0 xl:w-full ${selected ? 'bg-green-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-primary'}`}
                >
                  {selected && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-green" aria-hidden="true" />}
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[9px] text-faint">{model.index}</span>
                    <span className="text-[13px] font-semibold">{model.name}</span>
                  </div>
                  <div className="mt-1.5 pl-[22px] font-mono text-[8px] uppercase tracking-[0.07em] text-faint">{model.type}</div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-line px-3.5 py-4">
            <div className="eyebrow">Active model</div>
            <p className="mt-2 text-xs font-medium text-primary">{active.note}</p>
            <p className="mt-1 text-[11px] text-muted">Calibrated · {active.range}</p>
          </div>
          <div className="border-t border-line px-3.5 py-4">
            <div className="mb-2.5 flex items-center justify-between"><span className="eyebrow">Kernel</span><span className="status-dot" /></div>
            <div className="grid grid-cols-2 rounded-md border border-line bg-surface-2 p-0.5">
              {[['rust','Rust WASM'],['js','JS Ref.']].map(([id,label]) => (
                <button
                  key={id}
                  onClick={() => setEngine(id)}
                  aria-pressed={engine === id}
                  className={`rounded-[4px] px-2 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.05em] ${engine === id ? 'bg-surface text-primary shadow-sm' : 'text-faint hover:text-primary'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <Suspense fallback={<LoadingSpinner message="Loading model…" />}>
          <ActiveComponent engine={engine} onEngineFallback={handleEngineFallback} />
        </Suspense>
      </div>
    </div>
  );
}
