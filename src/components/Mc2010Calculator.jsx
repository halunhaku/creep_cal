import React from 'react';
import { mc2010Phi } from '../math/creepModels';
import ModelCalculator from './ModelCalculator';

const config = {
  name: 'fib MC 2010',
  descriptions: {
    js: 'fib Model Code 2010 calculation for basic and drying creep with strength, humidity, section size, temperature, and cement class inputs.',
    rust: 'fib Model Code 2010 calculation using the Rust WASM kernel for rapid 10000-day creep coefficient series.',
  },
  initialParams: { fcm: 40, RH: 70, t0: 28, Ac: 1000, u: 400, T: 20, Cs: '42.5R' },
  paramsConfig: [
    { name: 'fcm', label: 'Concrete Strength', min: 10, max: 150, unit: 'MPa' },
    { name: 'RH', label: 'Relative Humidity', min: 0, max: 100, unit: '%' },
    { name: 't0', label: 'Age at Loading', min: 1, max: 1000, unit: 'Days' },
    { name: 'Ac', label: 'Cross Section Area', min: 1, max: 1000000, unit: 'mm²' },
    { name: 'u', label: 'Perimeter', min: 1, max: 10000, unit: 'mm' },
    { name: 'T', label: 'Temperature', min: -20, max: 100, unit: '°C' },
    {
      name: 'Cs',
      label: 'Cement Class',
      options: ['32.5N', '32.5R', '42.5N', '42.5R', '52.5N', '52.5R']
        .map((value) => ({ value, label: value })),
    },
  ],
  loadingMessage: 'Loading Rust fib MC 2010 WASM Module...',
  readyMessage: 'Kernel v2.4 (MC2010-Rust) initialized successfully.',
  startMessage: (params) => `Initiating calculation with fcm=${params.fcm}MPa, t0=${params.t0}d`,
  calculateJs(params, maxDays) {
    const results = new Array(maxDays + 1);
    for (let t = 0; t <= maxDays; t += 1) {
      results[t] = {
        t,
        phi: mc2010Phi(params.fcm, params.RH, params.t0, params.Ac, params.u, params.T, params.Cs, t),
      };
    }
    return results;
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_mc2010_series({
      fcm: params.fcm,
      rh: params.RH,
      t0: params.t0,
      ac: params.Ac,
      u: params.u,
      t: params.T,
      cement_type: params.Cs,
    }, maxDays);
  },
  getSummary(results) {
    return { primary: results.at(-1)?.phi ?? NaN };
  },
  chartLines: [{ dataKey: 'phi', stroke: 'var(--green)', name: 'Creep Coefficient φ' }],
};

export default function Mc2010Calculator({ engine }) {
  return <ModelCalculator engine={engine} config={config} />;
}
