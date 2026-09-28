import React from 'react';
import { aci209Phi } from '../math/creepModels';
import ModelCalculator from './ModelCalculator';

const curingOptions = [
  { value: 'moist', label: 'Moist Cured' },
  { value: 'steam', label: 'Steam Cured' },
];

const config = {
  name: 'ACI 209R',
  descriptions: {
    js: 'Official ACI 209R-92 creep coefficient using curing, loading age, humidity, member size, slump, fine aggregate, and air content corrections.',
    rust: 'Official ACI 209R-92 creep coefficient using the Rust WASM kernel for the 10000-day concrete-age series.',
  },
  initialParams: {
    curingType: 'moist',
    t0: 28,
    targetAge: 365,
    H: 70,
    VS: 100,
    slump: 100,
    fineAggregate: 50,
    airContent: 8,
  },
  paramsConfig: [
    { name: 'curingType', label: 'Curing Type', options: curingOptions },
    { name: 't0', label: 'Age at Loading', min: 1, max: 365, unit: 'Days' },
    { name: 'targetAge', label: 'Target Age', min: 1, max: 10000, unit: 'Days' },
    { name: 'H', label: 'Relative Humidity', min: 0, max: 100, unit: '%' },
    { name: 'VS', label: 'Volume-Surface Ratio', min: 1, max: 1000, unit: 'mm' },
    { name: 'slump', label: 'Concrete Slump', min: 0, max: 300, unit: 'mm' },
    { name: 'fineAggregate', label: 'Fine Aggregate', min: 0, max: 100, unit: '%' },
    { name: 'airContent', label: 'Air Content', min: 0, max: 20, unit: '%' },
  ],
  loadingMessage: 'Loading Rust ACI209 WASM Module...',
  readyMessage: 'Kernel v2.4 (ACI209-Rust) initialized successfully.',
  startMessage: (params) => (
    `Initiating ${params.curingType}-cured calculation with t0=${params.t0}d, H=${params.H}%`
  ),
  calculateJs(params, maxDays) {
    const results = new Array(maxDays + 1);
    for (let t = 0; t <= maxDays; t += 1) {
      results[t] = { t, phi: aci209Phi({ ...params, t }) };
    }
    return results;
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_aci209_series(params, maxDays);
  },
  getSummary(results, targetAge) {
    const current = results[Math.min(results.length - 1, Math.max(0, Math.round(targetAge ?? 10000)))];
    return { primary: current?.phi ?? NaN };
  },
  chartLines: [{ dataKey: 'phi', stroke: 'var(--primary)', name: 'Creep Coefficient φ' }],
};

export default function Aci209Calculator({ engine }) {
  return <ModelCalculator engine={engine} config={config} />;
}
