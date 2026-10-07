import React, { useEffect } from 'react';
import { gl2000CompliancePoint, gl2000ShrinkagePoint } from '../math/creepModels';
import ModelCalculator from './ModelCalculator';

const cementOptions = [
  { value: 'I', label: 'Type I' },
  { value: 'II', label: 'Type II' },
  { value: 'III', label: 'Type III' },
];

function chartPoint(t, shrinkage, compliance) {
  return {
    t,
    j_micro_mpa: compliance.J * 1e6,
    comp_basic: ((compliance.phiTc * compliance.basic) / compliance.eCm28) * 1e6,
    comp_drying: ((compliance.phiTc * compliance.drying) / compliance.eCm28) * 1e6,
    epsilon_sh: shrinkage.epsilonSH,
    epsilon_total: shrinkage.epsilonTotal,
    ultimate: shrinkage.ultimate,
    betaH: shrinkage.betaH,
    betaT: shrinkage.betaT,
    phi28: compliance.phi28,
  };
}

const config = {
  id: 'gl2000',
  name: 'GL2000',
  descriptions: {
    js: 'Gardner and Lockman GL2000 strength-based prediction (no mix proportions): compliance from the creep coefficient plus drying shrinkage.',
    rust: 'No Rust kernel for GL2000 yet — this model always runs on the JavaScript reference kernel.',
  },
  initialParams: {
    cementType: 'I',
    fcm28: 32.5,
    h: 70,
    vs: 100,
    tc: 7,
    t0: 28,
    targetAge: 365,
  },
  paramsConfig: [
    { name: 'cementType', label: 'Cement Type', options: cementOptions },
    { name: 'fcm28', label: 'Mean 28-Day Strength', min: 16, max: 82, step: 0.1, unit: 'MPa' },
    { name: 'h', label: 'Relative Humidity', min: 20, max: 100, step: 0.1, unit: '%' },
    { name: 'vs', label: 'Volume-Surface Ratio', min: 1, max: 1000, step: 0.01, unit: 'mm' },
    { name: 'tc', label: 'Drying Start Age', min: 0, max: 365, step: 0.1, unit: 'Days' },
    { name: 't0', label: 'Age at Loading', min: 1, max: 365, step: 0.1, unit: 'Days' },
    { name: 'targetAge', label: 'Target Age', min: 1, max: 10000, step: 1, unit: 'Days' },
  ],
  /**
   * Loading before drying started leaves Φ(tc) undefined (square root of a
   * negative gap), so, like MC2010's stress rule, it is reported up front
   * with the cursor on the field instead of failing after the run.
   */
  validateInputs(params) {
    if (Number.isFinite(Number(params.t0)) && Number.isFinite(Number(params.tc)) && Number(params.t0) < Number(params.tc)) {
      return {
        field: 't0',
        message: `Age at loading must be at or after drying start (t0 ≥ tc) · 先干燥后加载`,
      };
    }
    return null;
  },
  loadingMessage: 'Loading GL2000 kernel…',
  readyMessage: 'GL2000 kernel ready.',
  startMessage: (params) => (
    `Initiating GL2000 with fcm28=${params.fcm28}MPa, h=${params.h}%, t0=${params.t0}d`
  ),
  calculateJs(params, maxDays) {
    const results = new Array(maxDays + 1);
    for (let t = 0; t <= maxDays; t += 1) {
      results[t] = chartPoint(
        t,
        gl2000ShrinkagePoint({ ...params, t }),
        gl2000CompliancePoint({ ...params, t }),
      );
    }
    return results;
  },
  getSummary(results, params) {
    const current = results[Math.min(results.length - 1, Math.max(0, Math.round(params.targetAge ?? 10000)))];
    return {
      primary: current ? current.j_micro_mpa / 1000 : NaN,
      extraResults: current ? [
        { label: 'Elastic 1/Ecmto', value: current.j_micro_mpa - current.comp_basic - current.comp_drying, unit: '×10⁻⁶/MPa', group: 'compliance' },
        { label: 'Basic creep', value: current.comp_basic, unit: '×10⁻⁶/MPa', group: 'compliance' },
        { label: 'Drying creep', value: current.comp_drying, unit: '×10⁻⁶/MPa', group: 'compliance' },
        { label: 'Ultimate shrinkage εshu', value: current.ultimate, unit: 'με', group: 'shrinkage' },
        { label: 'Humidity factor β(h)', value: current.betaH, unit: '', group: 'shrinkage' },
        { label: 'Time factor β(t)', value: current.betaT, unit: '', group: 'shrinkage' },
        { label: 'Drying shrinkage εsh', value: current.epsilon_sh, unit: 'με', group: 'shrinkage' },
        { label: 'Total shrinkage εtotal', value: current.epsilon_total, unit: 'με', group: 'shrinkage', total: true },
      ] : [],
    };
  },
  chartLines: [
    { dataKey: 'j_micro_mpa', stroke: 'var(--primary)', name: 'Compliance J (10⁻⁶/MPa)', kind: 'compliance' },
    { dataKey: 'epsilon_sh', stroke: 'var(--accent)', name: 'Drying Shrinkage εsh (με)', kind: 'shrinkage' },
  ],
  resultLabel: 'Compliance J(t,t₀) · 1/GPa',
};

export default function Gl2000Calculator({ engine, onEngineFallback }) {
  // No Rust kernel for GL2000 yet: hand control back to the JS kernel
  // through the same fallback the app uses when WASM fails to load.
  useEffect(() => {
    if (engine !== 'js' && onEngineFallback) onEngineFallback();
  }, [engine, onEngineFallback]);
  return <ModelCalculator engine="js" config={config} onEngineFallback={onEngineFallback} />;
}
