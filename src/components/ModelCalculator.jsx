import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { appendFeedLog, loadCreepEngine } from '../wasm/creepEngine';
import CalculatorWrapper from './ui/CalculatorWrapper';

const MAX_DAYS = 10000;

function initialFeed(engine) {
  return [{
    time: new Date().toLocaleTimeString(),
    message: engine === 'rust'
      ? 'System initialized. Awaiting input...'
      : 'System initialized. JS Engine standing by...',
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

  const addLog = useCallback((message, type = 'info') => {
    appendFeedLog(setFeedLogs, message, type);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setResults([]);
    setFeedLogs(initialFeed(engine));

    if (!isRust) {
      setWasmModule(null);
      setWasmReady(true);
      return undefined;
    }

    setWasmModule(null);
    setWasmReady(false);
    addLog(config.loadingMessage, 'info');
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

    return () => {
      cancelled = true;
    };
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
  }, [stringParams]);

  const calculate = useCallback(() => {
    if (isRust && (!wasmReady || !wasmModule)) {
      addLog('Rust Engine not ready.', 'error');
      return;
    }

    addLog(config.startMessage(params), 'info');
    try {
      const startTime = performance.now();
      const nextResults = isRust
        ? config.calculateRust(wasmModule, params, MAX_DAYS)
        : config.calculateJs(params, MAX_DAYS);
      setResults(nextResults);
      addLog(`Calculation completed in ${(performance.now() - startTime).toFixed(2)}ms`, 'success');
    } catch (error) {
      addLog(`Calculation failed: ${error.message}`, 'error');
    }
  }, [addLog, config, isRust, params, wasmModule, wasmReady]);

  const summary = useMemo(() => config.getSummary(results), [config, results]);
  const ready = !isRust || wasmReady;

  return (
    <CalculatorWrapper
      modelName={`${config.name} (${engine.toUpperCase()})`}
      modelDescription={config.descriptions[engine]}
      paramsConfig={config.paramsConfig}
      params={params}
      onParamChange={handleParamChange}
      onCalculate={calculate}
      calculateReady={ready}
      buttonText={ready ? 'INITIATE CALCULATION' : 'LOADING KERNEL...'}
      phiResult={summary.primary}
      feedLogs={feedLogs}
      chartData={results}
      chartLines={config.chartLines}
      resultLabel={config.resultLabel}
      extraResults={summary.extraResults}
    />
  );
}
