import React from 'react';
import { gl2000CompliancePoint, gl2000ShrinkagePoint } from '../math/creepModels';
import { buildGl2000Params } from '../wasm/creepEngine';
import ModelCalculator from './ModelCalculator';

const cementOptions = [
  { value: 'I', label: { en: 'Type I', zh: 'I 型' } },
  { value: 'II', label: { en: 'Type II', zh: 'II 型' } },
  { value: 'III', label: { en: 'Type III', zh: 'III 型' } },
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

function rustChartPoint(point) {
  return {
    t: point.t,
    j_micro_mpa: point.j * 1e6,
    comp_basic: ((point.phi_tc * point.basic) / point.e_cm28) * 1e6,
    comp_drying: ((point.phi_tc * point.drying) / point.e_cm28) * 1e6,
    epsilon_sh: point.epsilon_sh,
    epsilon_total: point.epsilon_total,
    ultimate: point.ultimate,
    betaH: point.beta_h,
    betaT: point.beta_t,
    phi28: point.phi28,
  };
}

// Exported so parameterUnits.test.js can compare the documented unit column against
// the real config object instead of regex-parsing this file's text; models.locale.test.jsx
// reads it the same way, which is also why this is not a component-only module.
// eslint-disable-next-line react-refresh/only-export-components -- read directly by the tests
export const config = {
  id: 'gl2000',
  name: 'GL2000',
  descriptions: {
    js: {
      en: 'Gardner and Lockman GL2000 strength-based prediction (no mix proportions): compliance from the creep coefficient plus drying shrinkage.',
      zh: 'Gardner 与 Lockman 的 GL2000 强度型预测（不需要配合比）：由徐变系数得到柔量，另加干燥收缩。',
    },
    rust: {
      en: 'Gardner and Lockman GL2000 evaluated by the Rust WASM kernel with absolute concrete-age series.',
      zh: 'Gardner 与 Lockman 的 GL2000，由 Rust WASM 内核计算，输出以混凝土绝对龄期为横轴。',
    },
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
    { name: 'cementType', label: { en: 'Cement Type', zh: '水泥类型' }, options: cementOptions },
    { name: 'fcm28', label: { en: 'Mean 28-Day Strength', zh: '28 天平均强度' }, min: 16, max: 82, step: 0.1, unit: 'MPa' },
    { name: 'h', label: { en: 'Relative Humidity', zh: '相对湿度' }, min: 20, max: 100, step: 0.1, unit: '%' },
    { name: 'vs', label: { en: 'Volume-Surface Ratio', zh: '体积表面积比' }, min: 1, max: 1000, step: 0.01, unit: 'mm' },
    { name: 'tc', label: { en: 'Drying Start Age', zh: '干燥开始龄期' }, min: 0, max: 365, step: 0.1, unit: 'Days' },
    { name: 't0', label: { en: 'Age at Loading', zh: '加载龄期' }, min: 1, max: 365, step: 0.1, unit: 'Days' },
    { name: 'targetAge', label: { en: 'Target Age', zh: '目标龄期' }, min: 1, max: 10000, step: 1, unit: 'Days' },
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
        message: {
          en: 'Age at loading must be at or after drying start (t0 ≥ tc) · drying must begin before loading',
          zh: '加载龄期必须不早于开始干燥龄期（t0 ≥ tc）· 先干燥后加载',
        },
      };
    }
    return null;
  },
  readyMessage: {
    en: 'GL2000 kernel ready.',
    zh: 'GL2000 内核已就绪。',
  },
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
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_gl2000_series(buildGl2000Params(params), maxDays).map(rustChartPoint);
  },
  getSummary(results, params) {
    const current = results[Math.min(results.length - 1, Math.max(0, Math.round(params.targetAge ?? 10000)))];
    return {
      primary: current ? current.j_micro_mpa / 1000 : NaN,
      extraResults: current ? [
        { label: { en: 'Elastic 1/Ecmto', zh: '弹性 1/Ecmto' }, value: current.j_micro_mpa - current.comp_basic - current.comp_drying, unit: '×10⁻⁶/MPa', group: 'compliance' },
        { label: { en: 'Basic creep', zh: '基本徐变' }, value: current.comp_basic, unit: '×10⁻⁶/MPa', group: 'compliance' },
        { label: { en: 'Drying creep', zh: '干燥徐变' }, value: current.comp_drying, unit: '×10⁻⁶/MPa', group: 'compliance' },
        { label: { en: 'Ultimate shrinkage εshu', zh: '极限收缩 εshu' }, value: current.ultimate, unit: 'με', group: 'shrinkage' },
        { label: { en: 'Humidity factor β(h)', zh: '湿度系数 β(h)' }, value: current.betaH, unit: '', group: 'shrinkage' },
        { label: { en: 'Time factor β(t)', zh: '时间系数 β(t)' }, value: current.betaT, unit: '', group: 'shrinkage' },
        { label: { en: 'Drying shrinkage εsh', zh: '干燥收缩 εsh' }, value: current.epsilon_sh, unit: 'με', group: 'shrinkage' },
        { label: { en: 'Total shrinkage εtotal', zh: '总收缩 εtotal' }, value: current.epsilon_total, unit: 'με', group: 'shrinkage', total: true },
      ] : [],
    };
  },
  chartLines: [
    { dataKey: 'j_micro_mpa', stroke: 'var(--series-1)', name: { en: 'Compliance J (10⁻⁶/MPa)', zh: '柔量 J（10⁻⁶/MPa）' }, kind: 'compliance' },
    { dataKey: 'epsilon_sh', stroke: 'var(--series-2)', name: { en: 'Drying Shrinkage εsh (με)', zh: '干燥收缩 εsh（με）' }, kind: 'shrinkage' },
  ],
  resultLabel: { en: 'Compliance J(t,t₀) · 1/GPa', zh: '柔量 J(t,t₀) · 1/GPa' },
};

export default function Gl2000Calculator({ engine, onEngineFallback }) {
  return <ModelCalculator engine={engine} config={config} onEngineFallback={onEngineFallback} />;
}
