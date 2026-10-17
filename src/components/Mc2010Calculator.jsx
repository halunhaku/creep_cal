import React from 'react';
import { mc2010Point } from '../math/creepModels';
import { buildMc2010Params } from '../wasm/creepEngine';
import ModelCalculator from './ModelCalculator';

// Exported so parameterUnits.test.js can compare the documented unit column against
// the real config object instead of regex-parsing this file's text; models.locale.test.jsx
// reads it the same way, which is also why this is not a component-only module.
// eslint-disable-next-line react-refresh/only-export-components -- read directly by the tests
export const config = {
  id: 'mc2010',
  // A standard's name is not translated: it is the same string in a Chinese and an
  // English report, and the Chinese model notes use it unchanged.
  name: 'fib Model Code 2010',
  descriptions: {
    js: {
      en: 'Published fib Model Code 2010 creep formulation with basic creep, drying creep, and the nonlinear stress correction of Eq. 5.1-74.',
      zh: 'fib Model Code 2010 正式徐变公式，包含基本徐变、干燥徐变，以及 Eq. 5.1-74 的非线性应力修正。',
    },
    rust: {
      en: 'Published fib Model Code 2010 creep formulation evaluated by the Rust WASM kernel, including component and nonlinear results.',
      zh: 'fib Model Code 2010 正式徐变公式，由 Rust WASM 内核计算，并给出各分量与非线性结果。',
    },
  },
  initialParams: {
    fcm: 40,
    RH: 70,
    t0: 28,
    targetAge: 365,
    Ac: 90000,
    u: 1200,
    T: 20,
    Cs: '42.5 R',
    sigma: 12,
  },
  // The Chinese labels are the ones the shipped notes already use in their input
  // table, so the grid and public/模型说明/mc2010.md name the same field the same way.
  paramsConfig: [
    { name: 'fcm', label: { en: 'Mean Compressive Strength', zh: '平均抗压强度' }, min: 20, max: 130, step: 0.1, unit: 'MPa' },
    { name: 'RH', label: { en: 'Relative Humidity', zh: '相对湿度' }, min: 40, max: 100, step: 0.1, unit: '%' },
    { name: 't0', label: { en: 'Age at Loading', zh: '加载龄期' }, min: 1, max: 1000, step: 0.1, unit: 'Days' },
    { name: 'targetAge', label: { en: 'Target Age', zh: '目标龄期' }, min: 1, max: 10000, step: 1, unit: 'Days' },
    { name: 'Ac', label: { en: 'Cross Section Area', zh: '截面面积' }, min: 1, max: 1000000, unit: 'mm²' },
    { name: 'u', label: { en: 'Drying Perimeter', zh: '干燥周长' }, min: 1, max: 10000, unit: 'mm' },
    { name: 'T', label: { en: 'Constant Curing Temperature', zh: '恒定养护温度' }, min: 5, max: 30, step: 0.1, unit: '°C' },
    {
      name: 'Cs',
      label: { en: 'Cement Strength Class', zh: '水泥强度等级' },
      // Strength-class designations, not wording — `42.5 R` is `42.5 R` in both.
      options: ['32.5 N', '32.5 R', '42.5 N', '42.5 R', '52.5 N', '52.5 R']
        .map((value) => ({ value, label: value })),
    },
    { name: 'sigma', label: { en: 'Initial Concrete Stress', zh: '初始混凝土应力' }, min: -78, max: 78, step: 0.1, unit: 'MPa' },
  ],
  readyMessage: {
    en: 'Published MC2010 creep kernel initialized successfully.',
    zh: 'MC2010 正式徐变内核初始化成功。',
  },
  /**
   * |σ| ≤ 0.6·fcm is the model's nonlinear-stress limit (Eq. 5.1-74). It spans two
   * fields, so the per-field ranges cannot express it: sigma's own range allows 78
   * MPa, which is only legal at fcm = 130. Without this the button looked ready and
   * the run could only end in an error notice.
   *
   * Both languages are built here rather than at the call site because the limit is
   * a computed number: a catalogue message would need the value interpolated at
   * render time, and the rule is the only thing that knows it.
   */
  validateInputs({ fcm, sigma }) {
    const limit = 0.6 * Number(fcm);
    if (!Number.isFinite(limit) || Math.abs(Number(sigma)) <= limit) return null;
    const value = Number(limit.toFixed(2));
    return {
      field: 'sigma',
      message: {
        en: `|σ| must be ≤ 0.6·fcm = ${value} MPa · outside the MC2010 stress range`,
        zh: `|σ| 必须 ≤ 0.6·fcm = ${value} MPa · 超出 MC2010 应力适用范围`,
      },
    };
  },
  calculateJs(params, maxDays) {
    const results = new Array(maxDays + 1);
    for (let t = 0; t <= maxDays; t += 1) {
      results[t] = mc2010Point({ ...params, t });
    }
    return results;
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_mc2010_series(buildMc2010Params(params), maxDays);
  },
  getSummary(results, params) {
    const targetAge = params.targetAge;
    const final = results[Math.min(results.length - 1, Math.max(0, Math.round(targetAge ?? 10000)))];
    return {
      primary: final?.phi ?? NaN,
      extraResults: [
        { label: { en: 'Basic Creep φbc', zh: '基本徐变 φbc' }, value: final?.phi_bc },
        { label: { en: 'Drying Creep φdc', zh: '干燥徐变 φdc' }, value: final?.phi_dc },
        { label: { en: 'Nonlinear Factor', zh: '非线性系数' }, value: final?.nonlinear_factor },
      ],
    };
  },
  chartLines: [
    { dataKey: 'phi', stroke: 'var(--series-1)', name: { en: 'Total Creep Coefficient φ', zh: '总徐变系数 φ' } },
    { dataKey: 'phi_bc', stroke: 'var(--series-3)', name: { en: 'Basic Creep φbc', zh: '基本徐变 φbc' } },
    { dataKey: 'phi_dc', stroke: 'var(--series-2)', name: { en: 'Drying Creep φdc', zh: '干燥徐变 φdc' } },
  ],
};

export default function Mc2010Calculator({ engine, onEngineFallback }) {
  return <ModelCalculator engine={engine} config={config} onEngineFallback={onEngineFallback} />;
}
