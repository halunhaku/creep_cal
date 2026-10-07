import React from 'react';
import { aashtoPoint } from '../math/creepModels';
import { buildAashtoParams } from '../wasm/creepEngine';
import ModelCalculator from './ModelCalculator';

function chartPoint(t, result) {
  return {
    t,
    psi: result.psi,
    epsilon_sh: result.epsilonSH,
    epsilon_total: result.epsilonTotal,
  };
}

function rustChartPoint(point) {
  return {
    t: point.t,
    psi: point.psi,
    epsilon_sh: point.epsilon_sh,
    epsilon_total: point.epsilon_total,
  };
}

const config = {
  id: 'aashto',
  name: 'AASHTO LRFD',
  descriptions: {
    js: 'AASHTO LRFD (NCHRP 18-07) creep coefficient and shrinkage: strength-based with humidity, size and time factors.',
    rust: 'AASHTO LRFD evaluated by the Rust WASM kernel with absolute concrete-age series.',
  },
  initialParams: {
    fci: 41,
    H: 70,
    vs: 89,
    ti: 7,
    tc: 7,
    targetAge: 365,
  },
  paramsConfig: [
    { name: 'fci', label: 'Strength at Loading', min: 16.5, max: 103.5, step: 0.1, unit: 'MPa' },
    { name: 'H', label: 'Relative Humidity', min: 0, max: 100, step: 0.1, unit: '%' },
    { name: 'vs', label: 'Volume-Surface Ratio', min: 1, max: 1000, step: 0.01, unit: 'mm' },
    { name: 'ti', label: 'Age at Loading', min: 1, max: 365, step: 0.1, unit: 'Days' },
    { name: 'tc', label: 'Curing-End Age', min: 0, max: 365, step: 0.1, unit: 'Days' },
    { name: 'targetAge', label: 'Target Age', min: 1, max: 10000, step: 1, unit: 'Days' },
  ],
  loadingMessage: 'Loading AASHTO LRFD kernel…',
  readyMessage: 'AASHTO LRFD kernel ready.',
  startMessage: (params) => (
    `Initiating AASHTO with fci=${params.fci}MPa, H=${params.H}%, ti=${params.ti}d`
  ),
  calculateJs(params, maxDays) {
    const results = new Array(maxDays + 1);
    for (let t = 0; t <= maxDays; t += 1) {
      results[t] = chartPoint(t, aashtoPoint({ ...params, t }));
    }
    return results;
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_aashto_series(buildAashtoParams(params), maxDays).map(rustChartPoint);
  },
  getSummary(results, params) {
    const current = results[Math.min(results.length - 1, Math.max(0, Math.round(params.targetAge ?? 10000)))];
    return {
      primary: current ? current.psi : NaN,
      extraResults: current ? [
        { label: 'Drying shrinkage εsh', value: current.epsilon_sh, unit: 'με', group: 'shrinkage' },
        { label: 'Total shrinkage εtotal', value: current.epsilon_total, unit: 'με', group: 'shrinkage', total: true },
      ] : [],
    };
  },
  chartLines: [
    { dataKey: 'psi', stroke: 'var(--primary)', name: 'Creep Coefficient ψ', kind: 'compliance' },
    { dataKey: 'epsilon_sh', stroke: 'var(--accent)', name: 'Drying Shrinkage εsh (με)', kind: 'shrinkage' },
  ],
  resultLabel: 'Creep Coefficient ψ(t,ti)',
};

export default function AashtoCalculator({ engine, onEngineFallback }) {
  return <ModelCalculator engine={engine} config={config} onEngineFallback={onEngineFallback} />;
}
