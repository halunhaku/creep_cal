import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { setEngine, setModel, useAppSelector } from '../state/appStore';
import { usePick, useT } from '../i18n';
import { MODEL_CALCULATORS, preloadedModels } from '../workspaces';

const CALCULATORS = Object.fromEntries(
  Object.entries(MODEL_CALCULATORS).map(([id, load]) => [id, lazy(load)]),
);

// Model names are standard designations and stay as they are; the three prose
// fields describe the model's standing, method and calibrated range, so they
// carry both languages and are resolved with pick() at render time.
const MODELS = [
  { id:'aci209', index:'01', name:'ACI 209R-92', type:{ en:'Empirical · Design', zh:'经验型 · 设计用' }, note:{ en:'Established correction-factor method', zh:'成熟的修正系数法' }, range:{ en:'Normal-strength concrete', zh:'普通强度混凝土' } },
  { id:'mc2010', index:'02', name:'fib MC 2010', type:{ en:'Code-based · Nonlinear', zh:'规范型 · 非线性' }, note:{ en:'Basic and drying creep components', zh:'基本徐变与干燥徐变分量' }, range:{ en:'20–130 MPa', zh:'20–130 MPa' } },
  { id:'b4', index:'03', name:'RILEM Model B4', type:{ en:'Composition-based · Long-term', zh:'配合比型 · 长期' }, note:{ en:'Mix proportions and staged temperature', zh:'需配合比与分阶段温度' }, range:{ en:'15–70 MPa', zh:'15–70 MPa' } },
  { id:'b4s', index:'04', name:'RILEM Model B4s', type:{ en:'Strength-based · Preliminary', zh:'强度型 · 初步设计' }, note:{ en:'No mix proportions required', zh:'不需要配合比' }, range:{ en:'15–70 MPa', zh:'15–70 MPa' } },
  { id:'gl2000', index:'05', name:'GL2000', type:{ en:'Strength-based · Full', zh:'强度型 · 完整' }, note:{ en:'Compliance and drying shrinkage', zh:'柔量与干燥收缩' }, range:{ en:'16–82 MPa', zh:'16–82 MPa' } },
  { id:'aashto', index:'06', name:'AASHTO LRFD', type:{ en:'Code-based · Bridge', zh:'规范型 · 桥梁' }, note:{ en:'Creep coefficient and shrinkage', zh:'徐变系数与收缩' }, range:{ en:'16.5–103.5 MPa', zh:'16.5–103.5 MPa' } },
];

export default function SingleCalculationDashboard() {
  const t = useT();
  const pick = usePick();
  // From the store so the selected model and kernel survive leaving the tab.
  const engine = useAppSelector((state) => state.engine);
  const algorithm = useAppSelector((state) => state.model);
  // The entry point resolves the model view the first render needs; rendering it
  // directly is what keeps that first render from suspending (see workspaces.js).
  // Every later switch has no preloaded component and goes through React.lazy.
  const ActiveComponent = preloadedModels[algorithm] ?? CALCULATORS[algorithm];
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
      <header className="workspace-header flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="eyebrow">{t('dashboard.eyebrow')}</div>
          <h1 className="mt-2 font-display text-[28px] font-normal leading-[1.15] text-ink md:text-display-sm">{t('dashboard.title')}</h1>
          <p className="mt-2 max-w-2xl text-body-sm leading-relaxed text-muted">{t('dashboard.intro')}</p>
        </div>
        <div className="font-mono text-3xs text-faint">{t('dashboard.precision')}</div>
      </header>

      {/* The model picker is a horizontal strip rather than a second left column:
          the shell already owns the only persistent rail on screen. */}
      <section className="mb-5 rounded-card border border-line bg-surface p-2.5 shadow-card">
        <div className="flex flex-col gap-2.5 2xl:flex-row 2xl:items-center">
          <div
            role="group"
            aria-label={t('dashboard.modelsLabel')}
            className="flex min-w-0 flex-1 snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-px-1 p-0.5"
          >
            {MODELS.map((model) => {
              const selected = model.id === algorithm;
              return (
                <button
                  key={model.id}
                  type="button"
                  ref={selected ? activeModelRef : null}
                  onClick={() => setModel(model.id)}
                  data-model={model.id}
                  aria-pressed={selected}
                  aria-label={`${model.name} · ${pick(model.type)}`}
                  className={`min-w-[168px] snap-start scroll-ml-1 rounded-lg border px-3.5 py-2.5 text-left transition-colors ${selected ? 'border-action-border bg-action-soft text-ink' : 'border-transparent text-muted hover:bg-surface-2 hover:text-ink'}`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-3xs text-faint">{model.index}</span>
                    <span className="truncate text-body-sm font-semibold">{model.name}</span>
                  </span>
                  <span className="mt-1 block truncate font-mono text-3xs text-faint">{pick(model.type)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-0.5 2xl:border-l 2xl:border-line 2xl:pl-3">
            <span className="eyebrow flex items-center gap-2">
              <span className="status-dot" aria-hidden="true" />
              {t('dashboard.kernel')}
            </span>
            <div className="grid grid-cols-2 rounded-input border border-line bg-surface-2 p-0.5">
              {[['rust', t('dashboard.rustTab')], ['js', t('dashboard.jsTab')]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEngine(id)}
                  aria-pressed={engine === id}
                  data-action={`kernel-${id}`}
                  className={`touch-hit rounded-[7px] px-2.5 py-1.5 font-mono text-3xs font-semibold transition-colors ${engine === id ? 'bg-surface text-ink shadow-card' : 'text-faint hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1.5 text-xs">
          <span className="font-medium text-ink">{pick(active.note)}</span>
          <span className="text-faint" aria-hidden="true">·</span>
          <span className="text-muted">{t('dashboard.calibrated', { range: pick(active.range) })}</span>
        </div>
      </section>

      <Suspense fallback={<LoadingSpinner message={t('dashboard.loadingModel')} />}>
        <ActiveComponent engine={engine} onEngineFallback={handleEngineFallback} />
      </Suspense>
    </div>
  );
}
