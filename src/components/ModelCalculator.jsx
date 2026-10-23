import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendFeedLog, errorMessage, loadCreepEngine, setKernelStatus } from '../wasm/creepEngine';
import { MAX_SERIES_DAYS } from '../math/creepModels';
import { useLocale, usePick, useT } from '../i18n';
import { formatInteger } from '../i18n/format';
import { retryKernel, saveModelParams, setKernelFailure, useAppSelector } from '../state/appStore';
import CalculatorWrapper from './ui/CalculatorWrapper';

function initialFeed(engine, t) {
  return [{
    time: new Date().toLocaleTimeString(),
    message: engine === 'rust' ? t('calculator.log.kernelReadyRust') : t('calculator.log.kernelReadyJs'),
    type: 'info',
  }];
}

const KERNEL_NOTICE = 'kernel-unavailable';
const CALC_NOTICE = 'calculation-failed';
const COMPARE_NOTICE = 'comparison-failed';

/**
 * `targetAge` only selects a point of the already-computed series, so it never
 * invalidates a result; every other input does.
 */
const NON_INVALIDATING = new Set(['targetAge']);

/** Do two parameter objects describe the same run? (NaN counts as a value.) */
function sameRunInputs(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) {
    if (NON_INVALIDATING.has(key)) continue;
    const left = a?.[key];
    const right = b?.[key];
    const equal = typeof left === 'number' && typeof right === 'number'
      ? Object.is(left, right)
      : left === right;
    if (!equal) return false;
  }
  return true;
}

export default function ModelCalculator({ engine, config, onEngineFallback }) {
  const t = useT();
  const pick = usePick();
  const locale = useLocale();
  const isRust = engine === 'rust';
  // Parameters are persisted per model, so leaving the workspace and coming back
  // no longer discards them. Results are not carried: they recompute in a few
  // milliseconds when this component remounts, from the parameters below.
  const storedParams = useAppSelector((state) => state.paramsByModel[config.id]);
  const params = useMemo(
    () => ({ ...config.initialParams, ...storedParams }),
    [config.initialParams, storedParams],
  );
  const [results, setResults] = useState([]);
  const [wasmModule, setWasmModule] = useState(null);
  const [wasmReady, setWasmReady] = useState(!isRust);
  const [feedLogs, setFeedLogs] = useState(() => initialFeed(engine, t));
  // The parameters the results on screen were computed from. Staleness is derived
  // from this rather than set by the input handlers: loading a saved set or
  // pressing Reset changes the inputs without going through a field, and the old
  // flag could not see either, so the badge kept saying "Computed" over a number
  // that belonged to a different case (and the CSV export wrote that number
  // beside the new inputs).
  const [runParams, setRunParams] = useState(null);
  // The run this one superseded, for the before/after overlay: snapshotted
  // only when a recalculation actually moves off different inputs.
  const [prevRun, setPrevRun] = useState(null);
  const [duration, setDuration] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [notices, setNotices] = useState([]);
  const initialRunRef = useRef(false);
  // Held in a ref so an inline callback from the parent cannot retrigger the
  // kernel-loading effect on every render.
  const fallbackRef = useRef(onEngineFallback);
  useEffect(() => { fallbackRef.current = onEngineFallback; }, [onEngineFallback]);

  // Held in a ref so the kernel-loading effect below can log in the reader's
  // current language without listing `t` as a dependency: `t` changes identity on
  // an interface-language switch, and the effect resets results, timings and the
  // log when it re-runs — switching language must not throw away a calculation.
  const translateRef = useRef(t);
  useEffect(() => { translateRef.current = t; }, [t]);

  const addLog = useCallback((message, type = 'info') => {
    appendFeedLog(setFeedLogs, message, type);
  }, []);

  const dismissNotice = useCallback((id) => {
    // The kernel notice is derived from the store, so dismissing it clears the
    // stored reason as well — otherwise the dismiss button would have no effect.
    if (id === KERNEL_NOTICE) setKernelFailure(null);
    setNotices((previous) => previous.filter((notice) => notice.id !== id));
  }, []);

  const raiseNotice = useCallback((notice) => {
    setNotices((previous) => [...previous.filter((item) => item.id !== notice.id), notice]);
  }, []);

  /*
   * Kernel loading is a function of (engine, retry counter) rather than of the
   * effect alone.
   *
   * An earlier revision turned the trigger button into "Kernel unavailable" once a
   * load failed and expected the caller's fallback to switch engines — but the
   * caller is the workspace itself (SingleCalculationDashboard passes no
   * `onEngineFallback`), so the button read "Kernel unavailable", and pressing it
   * logged "Rust WebAssembly kernel is not ready." without ever calling
   * `loadCreepEngine` again. The notice's advice to "click Rust WASM to retry"
   * therefore meant leaving and re-entering the kernel; `retryKernel` re-runs this
   * effect, which is also what the palette and the engine toggle do when the
   * selected engine is already selected.
   */
  // Kept in the store: this component unmounts on every model switch, and a
  // component-local counter would restart at zero and re-issue a load the reader
  // had already asked for (or, worse, consider the failed one still current).
  const kernelAttempt = useAppSelector((state) => state.kernelAttempt);
  // Read inside the kernel-load handlers, which outlive the effect that started them.
  const engineRef = useRef(engine);
  const kernelAttemptRef = useRef(kernelAttempt);
  // Declared *before* the loading effect so it runs first in commit order: the
  // handlers that outlive it then read this commit's values, not the previous one's.
  useEffect(() => {
    engineRef.current = engine;
    kernelAttemptRef.current = kernelAttempt;
  }, [engine, kernelAttempt]);

  useEffect(() => {
    // Deliberate reset when the selected kernel changes: user-entered params are
    // preserved across an engine switch, everything derived from a run is not.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on kernel change
    setResults([]);
    setFeedLogs(initialFeed(engine, translateRef.current));
    setRunParams(null);
    setPrevRun(null);
    setDuration(null);
    initialRunRef.current = false;

    if (!isRust) {
      setWasmModule(null);
      setWasmReady(true);
      setKernelStatus({ engine: 'js', state: 'ready' });
      return undefined;
    }

    setWasmModule(null);
    setWasmReady(false);
    setKernelStatus({ engine: 'rust', state: 'loading' });
    /*
     * Not cancelled by cleanup. This effect re-runs whenever the callbacks or the
     * config change — which is every store update — and the original revision
     * dropped the in-flight load on each one. The outcome was that a load still in
     * progress when the store moved never reported success *or* failure: no notice,
     * no fallback, and a module whose `enginePromise` had already been discarded, so
     * the retry below could not even observe the failure. A load that finishes after
     * an engine switch is ignored by checking the engine it was started for, and a
     * genuinely new attempt supersedes it by version rather than by cancellation.
     */
    const attempt = kernelAttempt;
    loadCreepEngine()
      .then((module) => {
        if (attempt !== kernelAttemptRef.current || engineRef.current !== 'rust') return;
        setWasmModule(module);
        setWasmReady(true);
        setKernelFailure(null);
        setKernelStatus({ engine: 'rust', state: 'ready' });
        addLog(pick(config.readyMessage), 'success');
      })
      .catch((error) => {
        if (attempt !== kernelAttemptRef.current || engineRef.current !== 'rust') return;
        const detail = errorMessage(error);
        /*
         * The failure is published to the store, not to local state. The fallback
         * below switches the engine, which re-renders this component and discards any
         * state update queued behind it — the visible notice used to be raised that
         * way and was therefore lost on the same frame it was created (only the log
         * line survived). `appStore.kernelFailure` outlives both the re-render and
         * this component's own unmount on a model switch.
         */
        setKernelFailure(detail);
        addLog(translateRef.current('calculator.log.wasmFailed', { detail }), 'error');
        setKernelStatus({ engine: 'js', state: 'failed', detail });
        // Hand control back to the caller so it can switch kernels and let the JS
        // kernel take over. Without a caller to fall back to, the notice below (fed
        // by the store) offers the retry and the button keeps doing something.
        if (fallbackRef.current) fallbackRef.current();
      });
  }, [addLog, config, engine, isRust, kernelAttempt, pick]);


  const stringParams = useMemo(
    () => new Set(config.paramsConfig.filter((item) => item.options).map((item) => item.name)),
    [config],
  );

  const handleParamChange = useCallback((event) => {
    const { name, value } = event.target;
    saveModelParams(config.id, {
      ...params,
      [name]: stringParams.has(name) ? value : parseFloat(value),
    });
    // A timing is taken over the whole series, so a comparison survives a change
    // that only moves the read-out point; staleness itself is derived from
    // `runParams` below, which catches this and every other way the inputs move.
    if (name !== 'targetAge') setComparison(null);
  }, [config.id, params, stringParams]);

  const calculate = useCallback(() => {
    if (isRust && (!wasmReady || !wasmModule)) {
      addLog(t('calculator.log.kernelNotReady'), 'error');
      // A second attempt from the trigger re-tries the load: "Kernel unavailable"
      // is a state of the kernel, not a verdict on the button.
      if (!wasmReady) retryKernel();
      return;
    }

    try {
      const startTime = performance.now();
      const nextResults = isRust
        ? config.calculateRust(wasmModule, params, MAX_SERIES_DAYS)
        : config.calculateJs(params, MAX_SERIES_DAYS);
      const elapsed = performance.now() - startTime;
      setDuration(elapsed);
      // Snapshot the run being replaced so the chart can overlay before/after —
      // but only when the inputs actually moved (sameRunInputs already drives
      // the staleness badge, so the two stay consistent by construction).
      if (results.length > 0 && runParams !== null && !sameRunInputs(runParams, params)) {
        setPrevRun({ data: results, model: config.id });
      }
      setResults(nextResults);
      setRunParams(params);
      dismissNotice(CALC_NOTICE);
      addLog(t('calculator.log.calcDone', { ms: elapsed.toFixed(2) }), 'success');
    } catch (error) {
      const detail = errorMessage(error);
      addLog(t('calculator.log.calcFailed', { detail }), 'error');
      raiseNotice({ id: CALC_NOTICE, title: t('calculator.notice.calcTitle'), message: detail });
    }
  }, [addLog, config, dismissNotice, isRust, params, raiseNotice, results, runParams, t, wasmModule, wasmReady]);

  // Times both kernels on the identical parameter set and series length, so the
  // dual-engine design can be judged on measurements instead of claims. Each
  // kernel runs a warm-up pass first: the first Rust call also pays for module
  // instantiation, which would otherwise flatter the JavaScript kernel.
  const compareKernels = useCallback(async () => {
    setComparing(true);
    try {
      const module = wasmModule ?? await loadCreepEngine();
      const measure = (run) => {
        run();
        const start = performance.now();
        run();
        return performance.now() - start;
      };
      const jsMs = measure(() => config.calculateJs(params, MAX_SERIES_DAYS));
      const rustMs = measure(() => config.calculateRust(module, params, MAX_SERIES_DAYS));
      setComparison({ js: jsMs, rust: rustMs, days: MAX_SERIES_DAYS });
      addLog(t('calculator.log.compareDone', { days: formatInteger(MAX_SERIES_DAYS, locale), js: jsMs.toFixed(2), rust: rustMs.toFixed(2) }), 'success');
    } catch (error) {
      const detail = errorMessage(error);
      setComparison(null);
      addLog(t('calculator.log.compareFailed', { detail }), 'error');
      raiseNotice({ id: COMPARE_NOTICE, title: t('calculator.notice.compareTitle'), message: detail });
    } finally {
      setComparing(false);
    }
  }, [addLog, config, locale, params, raiseNotice, t, wasmModule]);

  /*
   * Two levels of validity. The per-field ranges come from the parameter config;
   * a model can also have a rule that spans fields (MC2010 needs |σ| ≤ 0.6·fcm, so
   * a σ that is fine for fcm = 130 is not fine for fcm = 40). Without the second
   * level the button looked ready and the run could only fail.
   */
  const fieldsValid = config.paramsConfig.every((item) => item.options || (
    Number.isFinite(Number(params[item.name])) && Number(params[item.name]) >= item.min && Number(params[item.name]) <= item.max
  ));
  const inputIssue = config.validateInputs?.(params) ?? null;
  const inputsValid = fieldsValid && !inputIssue;
  /*
   * The kernel notice is derived, not stored. `kernelFailure` lives in the store, so
   * the explanation survives the fallback re-render and a model switch, and the
   * message is re-built in the current language instead of being captured at
   * failure time. The parent's `onEngineFallback` tells the two variants apart: with a
   * caller that can switch engines the notice says so; without one it explains the
   * retry.
   */
  const kernelFailure = useAppSelector((state) => state.kernelFailure);
  // Whether a fallback exists is a prop fact, so it can be read during render.
  const canFallBack = Boolean(onEngineFallback);
  const derivedNotices = useMemo(() => {
    if (!kernelFailure || notices.some((notice) => notice.id === KERNEL_NOTICE)) return notices;
    return [{
      id: KERNEL_NOTICE,
      title: t('calculator.notice.kernelTitle'),
      message: canFallBack
        ? t('calculator.notice.kernelFallback', { detail: kernelFailure })
        : t('calculator.notice.kernelRetry', { detail: kernelFailure }),
    }, ...notices];
    // `t` is bound to the locale, which is a *state* field: depending on it made the
    // memo churn on every unrelated store write (kernel status included), re-rendering
    // the wrapper and re-running its Brush/reset effects for no visible change. The
    // notice is re-built in the current language whenever the failure or the reader's
    // own list changes; a language switch re-renders through `useT` anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the note above
  }, [canFallBack, kernelFailure, notices]);
  const kernelFailed = isRust && !wasmReady && Boolean(kernelFailure);
  const ready = (!isRust || wasmReady) && inputsValid;
  useEffect(() => {
    if (!ready || initialRunRef.current) return;
    initialRunRef.current = true;
    calculate();
  }, [calculate, ready]);

  // Results on screen belong to `runParams`; anything that moves the inputs since
  // — a field, a loaded parameter set, Reset, the palette — makes them stale.
  const dirty = runParams !== null && !sameRunInputs(runParams, params);
  // `runParams` is passed too: a model can derive a decomposition entry from the
  // inputs (B4's q₁ needs the Tc the run used), and those must not be read from
  // half-edited fields while the results on screen belong to the previous run.
  const summary = useMemo(
    () => config.getSummary(results, params, runParams),
    [config, params, results, runParams],
  );

  return (
    <CalculatorWrapper
      modelId={config.id}
      modelName={config.name}
      modelDescription={pick(config.descriptions[engine])}
      engine={engine}
      paramsConfig={config.paramsConfig}
      params={params}
      resultParams={runParams}
      onParamChange={handleParamChange}
      onCalculate={calculate}
      dirty={dirty}
      inputIssue={inputIssue}
      duration={duration}
      buttonText={ready ? t('calculator.button.calculate') : kernelFailed ? t('calculator.button.kernelUnavailable') : t('calculator.button.loadingKernel')}
      phiResult={summary.primary}
      feedLogs={feedLogs}
      chartData={results}
      chartLines={config.chartLines}
      prevData={prevRun && prevRun.model === config.id ? prevRun.data : null}
      resultLabel={config.resultLabel}
      extraResults={summary.extraResults}
      notices={derivedNotices}
      onDismissNotice={dismissNotice}
      comparison={comparison}
      comparing={comparing}
      onCompare={compareKernels}
      compareReady={inputsValid && typeof config.calculateRust === 'function'}
      compareNote={typeof config.calculateRust === 'function' ? null : t('calculator.comparison.jsOnly')}
    />
  );
}
