import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendFeedLog, loadCreepEngine } from '../wasm/creepEngine';
import CalculatorWrapper from './ui/CalculatorWrapper';

const MAX_DAYS = 10000;

function initialFeed(engine) {
  return [{
    time: new Date().toLocaleTimeString(),
    message: engine === 'rust' ? 'Rust WebAssembly kernel ready for initialization.' : 'JavaScript reference kernel ready.',
    type: 'info',
  }];
}

export default function ModelCalculator({ engine, config }) {
  const isRust = engine === 'rust';
  const [params, setParams] = useState(() => ({ ...config.initialParams }));
  const [results, setResults] = useState([]);
  const [wasmModule, setWasmModule] = useState(null);
  const [wasmReady, setWasmReady] = useState(!isRust);
  const [feedLogs, setFeedLogs] = useState(() => initialFeed(engine));
  const [dirty, setDirty] = useState(false);
  const [duration, setDuration] = useState(null);
  const initialRunRef = useRef(false);

  const addLog = useCallback((message, type = 'info') => {
    appendFeedLog(setFeedLogs, message, type);
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
      return undefined;
    }

    setWasmModule(null);
    setWasmReady(false);
    loadCreepEngine()
      .then((module) => {
        if (cancelled) return;
        setWasmModule(module);
        setWasmReady(true);
        addLog(config.readyMessage, 'success');
      })
      .catch((error) => {
        if (!cancelled) addLog(`WASM initialization failed: ${error.message}`, 'error');
      });

    return () => { cancelled = true; };
  }, [addLog, config, engine, isRust]);

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
    setDirty(true);
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
      addLog(`Calculation completed in ${elapsed.toFixed(2)} ms.`, 'success');
    } catch (error) {
      addLog(`Calculation failed: ${error.message}`, 'error');
    }
  }, [addLog, config, isRust, params, wasmModule, wasmReady]);

  const inputsValid = config.paramsConfig.every((item) => item.options || (
    Number.isFinite(Number(params[item.name])) && Number(params[item.name]) >= item.min && Number(params[item.name]) <= item.max
  ));
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
      buttonText={ready ? 'Calculate' : 'Loading kernel…'}
      phiResult={summary.primary}
      feedLogs={feedLogs}
      chartData={results}
      chartLines={config.chartLines}
      resultLabel={config.resultLabel}
      extraResults={summary.extraResults}
    />
  );
}
