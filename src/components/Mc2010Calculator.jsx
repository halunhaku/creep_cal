import React from 'react';
import { mc2010Point } from '../math/creepModels';
import ModelCalculator from './ModelCalculator';

const config = {
  name: 'fib Model Code 2010',
  descriptions: {
    js: 'Published fib Model Code 2010 creep formulation with basic creep, drying creep, and the nonlinear stress correction of Eq. 5.1-74.',
    rust: 'Published fib Model Code 2010 creep formulation evaluated by the Rust WASM kernel, including component and nonlinear results.',
  },
  initialParams: {
    fcm: 40,
    RH: 70,
    t0: 28,
    Ac: 90000,
    u: 1200,
    T: 20,
    Cs: '42.5 R',
    sigma: 12,
  },
  paramsConfig: [
    { name: 'fcm', label: 'Mean Compressive Strength', min: 20, max: 130, step: 0.1, unit: 'MPa' },
    { name: 'RH', label: 'Relative Humidity', min: 40, max: 100, step: 0.1, unit: '%' },
    { name: 't0', label: 'Age at Loading', min: 1, max: 1000, step: 0.1, unit: 'Days' },
    { name: 'Ac', label: 'Cross Section Area', min: 1, max: 1000000, unit: 'mm²' },
    { name: 'u', label: 'Drying Perimeter', min: 1, max: 10000, unit: 'mm' },
    { name: 'T', label: 'Constant Curing Temperature', min: 5, max: 30, step: 0.1, unit: '°C' },
    {
      name: 'Cs',
      label: 'Cement Strength Class',
      options: ['32.5 N', '32.5 R', '42.5 N', '42.5 R', '52.5 N', '52.5 R']
        .map((value) => ({ value, label: value })),
    },
    { name: 'sigma', label: 'Initial Concrete Stress', min: -78, max: 78, step: 0.1, unit: 'MPa' },
  ],
  loadingMessage: 'Loading Rust fib MC2010 WASM Module...',
  readyMessage: 'Published MC2010 creep kernel initialized successfully.',
  startMessage: (params) => (
    `Initiating MC2010 calculation with fcm=${params.fcm}MPa, t0=${params.t0}d, sigma=${params.sigma}MPa`
  ),
  calculateJs(params, maxDays) {
    const results = new Array(maxDays + 1);
    for (let t = 0; t <= maxDays; t += 1) {
      results[t] = mc2010Point({ ...params, t });
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
      sigma: params.sigma,
    }, maxDays);
  },
  getSummary(results) {
    const final = results.at(-1);
    return {
      primary: final?.phi ?? NaN,
      extraResults: [
        { label: 'Basic Creep φbc', value: final?.phi_bc },
        { label: 'Drying Creep φdc', value: final?.phi_dc },
        { label: 'Nonlinear Factor', value: final?.nonlinear_factor },
      ],
    };
  },
  chartLines: [
    { dataKey: 'phi', stroke: 'var(--green)', name: 'Total Creep Coefficient φ' },
    { dataKey: 'phi_bc', stroke: 'var(--cyan)', name: 'Basic Creep φbc' },
    { dataKey: 'phi_dc', stroke: 'var(--amber)', name: 'Drying Creep φdc' },
  ],
};

export default function Mc2010Calculator({ engine }) {
  return <ModelCalculator engine={engine} config={config} />;
}
