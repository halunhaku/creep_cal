import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendFeedLog, errorMessage, loadCreepEngine, setKernelStatus } from '../wasm/creepEngine';
import { MAX_SERIES_DAYS } from '../math/creepModels';
import { saveModelParams, useAppSelector } from '../state/appStore';
import CalculatorWrapper from './ui/CalculatorWrapper';

function initialFeed(engine) {
  return [{
    time: new Date().toLocaleTimeString(),
    message: engine === 'rust' ? 'Rust WebAssembly kernel ready for initialization.' : 'JavaScript reference kernel ready.',
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
  const [feedLogs, setFeedLogs] = useState(() => initialFeed(engine));
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

  const addLog = useCallback((message, type = 'info') => {
    appendFeedLog(setFeedLogs, message, type);
  }, []);

  const dismissNotice = useCallback((id) => {
    setNotices((previous) => previous.filter((notice) => notice.id !== id));
  }, []);

  const raiseNotice = useCallback((notice) => {
    setNotices((previous) => [...previous.filter((item) => item.id !== notice.id), notice]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Deliberate reset when the selected kernel changes: user-entered params are
    // preserved across an engine switch, everything derived from a run is not.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on kernel change
    setResults([]);
    setFeedLogs(initialFeed(engine));
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
    loadCreepEngine()
      .then((module) => {
        if (cancelled) return;
        setWasmModule(module);
        setWasmReady(true);
        setKernelStatus({ engine: 'rust', state: 'ready' });
        addLog(config.readyMessage, 'success');
      })
      .catch((error) => {
        if (cancelled) return;
        const detail = errorMessage(error);
        const canFallBack = Boolean(fallbackRef.current);
        setKernelStatus({ engine: 'js', state: 'failed', detail });
        addLog(`WASM initialization failed: ${detail}`, 'error');
        raiseNotice({
          id: KERNEL_NOTICE,
          title: 'Rust WebAssembly kernel unavailable · Rust 内核不可用',
          message: canFallBack
            ? `${detail} — 已自动切换为 JavaScript 参考实现，结果仍然有效；也可以点击左侧 “Rust WASM” 重试。`
            : detail,
        });
        // Do not leave the workspace stuck on a disabled button: hand control back
        // to the caller so it can switch kernels, and let the JS kernel take over.
        if (canFallBack) fallbackRef.current();
      });

    return () => { cancelled = true; };
  }, [addLog, config, engine, isRust, raiseNotice]);

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
      addLog('Rust WebAssembly kernel is not ready.', 'error');
      return;
    }

    try {
      const startTime = performance.now();
      const nextResults = isRust
        ? config.calculateRust(wasmModule, params, MAX_SERIES_DAYS)
        : config.calculateJs(params, MAX_SERIES_DAYS);
      const elapsed = performance.now() - startTime;
      // Snapshot the run being replaced so the chart can overlay before/after —
      // but only when the inputs actually moved (sameRunInputs already drives
      // the staleness badge, so the two stay consistent by construction).
      if (results.length > 0 && runParams !== null && !sameRunInputs(runParams, params)) {
        setPrevRun({ data: results, model: config.id });
      }
      setResults(nextResults);
      setRunParams(params);
      dismissNotice(CALC_NOTICE);
      addLog(`Calculation completed in ${elapsed.toFixed(2)} ms.`, 'success');
    } catch (error) {
      const detail = errorMessage(error);
      addLog(`Calculation failed: ${detail}`, 'error');
      raiseNotice({ id: CALC_NOTICE, title: 'Calculation failed · 计算失败', message: detail });
    }
  }, [addLog, config, dismissNotice, isRust, params, raiseNotice, results, runParams, wasmModule, wasmReady]);

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
      addLog(`Kernel comparison over ${MAX_SERIES_DAYS} days: JS ${jsMs.toFixed(2)} ms vs Rust ${rustMs.toFixed(2)} ms.`, 'success');
    } catch (error) {
      const detail = errorMessage(error);
      setComparison(null);
      addLog(`Kernel comparison failed: ${detail}`, 'error');
      raiseNotice({ id: COMPARE_NOTICE, title: 'Kernel comparison failed · 内核对比失败', message: detail });
    } finally {
      setComparing(false);
    }
  }, [addLog, config, params, raiseNotice, wasmModule]);

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
  const kernelFailed = isRust && !wasmReady && notices.some((notice) => notice.id === KERNEL_NOTICE);
  const ready = (!isRust || wasmReady) && inputsValid;
  useEffect(() => {
    if (!ready || initialRunRef.current) return;
    initialRunRef.current = true;
    calculate();
  }, [calculate, ready]);

  // Results on screen belong to `runParams`; anything that moves the inputs since
  // — a field, a loaded parameter set, Reset, the palette — makes them stale.
  const dirty = runParams !== null && !sameRunInputs(runParams, params);
  const summary = useMemo(() => config.getSummary(results, params), [config, params, results]);

  return (
    <CalculatorWrapper
      modelId={config.id}
      modelName={config.name}
      modelDescription={config.descriptions[engine]}
      engine={engine}
      paramsConfig={config.paramsConfig}
      params={params}
      resultParams={runParams}
      onParamChange={handleParamChange}
      onCalculate={calculate}
      calculateReady={ready}
      dirty={dirty}
      inputIssue={inputIssue}
      duration={duration}
      buttonText={ready ? 'Calculate' : kernelFailed ? 'Kernel unavailable' : 'Loading kernel…'}
      phiResult={summary.primary}
      feedLogs={feedLogs}
      chartData={results}
      chartLines={config.chartLines}
      prevData={prevRun && prevRun.model === config.id ? prevRun.data : null}
      resultLabel={config.resultLabel}
      extraResults={summary.extraResults}
      notices={notices}
      onDismissNotice={dismissNotice}
      comparison={comparison}
      comparing={comparing}
      onCompare={compareKernels}
      compareReady={inputsValid}
    />
  );
}
