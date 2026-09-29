import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendFeedLog, errorMessage, loadCreepEngine, setKernelStatus } from '../wasm/creepEngine';
import CalculatorWrapper from './ui/CalculatorWrapper';

const MAX_DAYS = 10000;

function initialFeed(engine) {
  return [{
    time: new Date().toLocaleTimeString(),
    message: engine === 'rust' ? 'Rust WebAssembly kernel ready for initialization.' : 'JavaScript reference kernel ready.',
    type: 'info',
  }];
}

const KERNEL_NOTICE = 'kernel-unavailable';
const CALC_NOTICE = 'calculation-failed';

export default function ModelCalculator({ engine, config, onEngineFallback }) {
  const isRust = engine === 'rust';
  const [params, setParams] = useState(() => ({ ...config.initialParams }));
  const [results, setResults] = useState([]);
  const [wasmModule, setWasmModule] = useState(null);
  const [wasmReady, setWasmReady] = useState(!isRust);
  const [feedLogs, setFeedLogs] = useState(() => initialFeed(engine));
  const [dirty, setDirty] = useState(false);
  const [duration, setDuration] = useState(null);
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
    setParams((previous) => ({
      ...previous,
      [name]: stringParams.has(name) ? value : parseFloat(value),
    }));
    // `targetAge` only selects a point of the already-computed 0–10,000 day
    // series, so it never invalidates the results.
    if (name !== 'targetAge') setDirty(true);
  }, [stringParams]);

  const calculate = useCallback(() => {
    if (isRust && (!wasmReady || !wasmModule)) {
      addLog('Rust WebAssembly kernel is not ready.', 'error');
      return;
    }

    try {
      const startTime = performance.now();
      const nextResults = isRust
        ? config.calculateRust(wasmModule, params, MAX_DAYS)
        : config.calculateJs(params, MAX_DAYS);
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
    />
  );
}
