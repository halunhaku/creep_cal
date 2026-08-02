import React from 'react';
import { aci209Phi } from '../math/creepModels';
import ModelCalculator from './ModelCalculator';

const config = {
  name: 'ACI 209R',
  descriptions: {
    js: 'ACI 209R-92 creep coefficient calculation with editable humidity, geometry, sand ratio, cement content, and air content inputs.',
    rust: 'ACI 209R-92 creep coefficient calculation using the Rust WASM kernel for the 10000-day time series.',
  },
  initialParams: { t0: 28, H: 70, VS: 100, sPhi: 0.5, Cc: 350, alpha: 0.08 },
  paramsConfig: [
    { name: 't0', label: 'Age at Loading', min: 1, max: 365, unit: 'Days' },
    { name: 'H', label: 'Relative Humidity', min: 0, max: 100, unit: '%' },
    { name: 'VS', label: 'Volume-Surface Ratio', min: 0, max: 1000, unit: 'mm' },
    { name: 'sPhi', label: 'Sand Ratio', min: 0, max: 1, unit: '' },
    { name: 'Cc', label: 'Cement Content', min: 0, max: 1000, unit: 'kg/m³' },
    { name: 'alpha', label: 'Air Content', min: 0, max: 0.1, unit: '' },
  ],
  loadingMessage: 'Loading Rust ACI209 WASM Module...',
  readyMessage: 'Kernel v2.4 (ACI209-Rust) initialized successfully.',
  startMessage: (params) => `Initiating calculation with t0=${params.t0}d, H=${params.H}%`,
  calculateJs(params, maxDays) {
    const results = new Array(maxDays + 1);
    for (let t = 0; t <= maxDays; t += 1) {
      results[t] = {
        t,
        phi: aci209Phi(params.t0, params.H, params.VS, params.sPhi, params.Cc, params.alpha, t),
      };
    }
    return results;
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_aci209_series({
      t0: params.t0,
      h: params.H,
      vs: params.VS,
      s_phi: params.sPhi,
      cc: params.Cc,
      alpha: params.alpha,
    }, maxDays);
  },
  getSummary(results) {
    return { primary: results.at(-1)?.phi ?? NaN };
  },
  chartLines: [{ dataKey: 'phi', stroke: '#2f6f4e', name: 'Creep Coefficient φ' }],
};

export default function Aci209Calculator({ engine }) {
  return <ModelCalculator engine={engine} config={config} />;
}
