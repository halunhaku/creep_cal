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
  const [dirty, setDirty] = useState(false);
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
    setDirty(false);
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
    // `targetAge` only selects a point of the already-computed 0–10,000 day
    // series, so it never invalidates the results — nor a timing taken over the
    // whole series, which is why a comparison survives it too.
    if (name !== 'targetAge') {
      setDirty(true);
      setComparison(null);
    }
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
      setResults(nextResults);
      setDuration(elapsed);
      setDirty(false);
      dismissNotice(CALC_NOTICE);
      addLog(`Calculation completed in ${elapsed.toFixed(2)} ms.`, 'success');
    } catch (error) {
      const detail = errorMessage(error);
      addLog(`Calculation failed: ${detail}`, 'error');
      raiseNotice({ id: CALC_NOTICE, title: 'Calculation failed · 计算失败', message: detail });
    }
  }, [addLog, config, dismissNotice, isRust, params, raiseNotice, wasmModule, wasmReady]);

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

  const inputsValid = config.paramsConfig.every((item) => item.options || (
    Number.isFinite(Number(params[item.name])) && Number(params[item.name]) >= item.min && Number(params[item.name]) <= item.max
  ));
  const kernelFailed = isRust && !wasmReady && notices.some((notice) => notice.id === KERNEL_NOTICE);
  const ready = (!isRust || wasmReady) && inputsValid;
  useEffect(() => {
    if (!ready || initialRunRef.current) return;
    initialRunRef.current = true;
    calculate();
  }, [calculate, ready]);

  const summary = useMemo(() => config.getSummary(results, params.targetAge), [config, params.targetAge, results]);

  return (
    <CalculatorWrapper
      modelId={config.id}
      modelName={config.name}
      modelDescription={config.descriptions[engine]}
      engine={engine}
      paramsConfig={config.paramsConfig}
      params={params}
      onParamChange={handleParamChange}
      onCalculate={calculate}
      calculateReady={ready}
      dirty={dirty}
      duration={duration}
      buttonText={ready ? 'Calculate' : kernelFailed ? 'Kernel unavailable' : 'Loading kernel…'}
      phiResult={summary.primary}
      feedLogs={feedLogs}
      chartData={results}
      chartLines={config.chartLines}
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
