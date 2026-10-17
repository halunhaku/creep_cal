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

// Exported so parameterUnits.test.js can compare the documented unit column against
// the real config object instead of regex-parsing this file's text; models.locale.test.jsx
// reads it the same way, which is also why this is not a component-only module.
// eslint-disable-next-line react-refresh/only-export-components -- read directly by the tests
export const config = {
  id: 'aashto',
  name: 'AASHTO LRFD',
  descriptions: {
    js: {
      en: 'AASHTO LRFD (NCHRP 18-07) creep coefficient and shrinkage: strength-based with humidity, size and time factors.',
      zh: 'AASHTO LRFD（NCHRP 18-07）徐变系数与收缩：基于强度，含湿度、尺寸与时间修正。',
    },
    rust: {
      en: 'AASHTO LRFD evaluated by the Rust WASM kernel with absolute concrete-age series.',
      zh: 'AASHTO LRFD 由 Rust WASM 内核计算，输出以混凝土绝对龄期为横轴。',
    },
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
    { name: 'fci', label: { en: 'Strength at Loading', zh: '加载时强度' }, min: 16.5, max: 103.5, step: 0.1, unit: 'MPa' },
    { name: 'H', label: { en: 'Relative Humidity', zh: '相对湿度' }, min: 0, max: 100, step: 0.1, unit: '%' },
    { name: 'vs', label: { en: 'Volume-Surface Ratio', zh: '体积表面积比' }, min: 1, max: 1000, step: 0.01, unit: 'mm' },
    { name: 'ti', label: { en: 'Age at Loading', zh: '加载龄期' }, min: 1, max: 365, step: 0.1, unit: 'Days' },
    { name: 'tc', label: { en: 'Curing-End Age', zh: '养护结束龄期' }, min: 0, max: 365, step: 0.1, unit: 'Days' },
    { name: 'targetAge', label: { en: 'Target Age', zh: '目标龄期' }, min: 1, max: 10000, step: 1, unit: 'Days' },
  ],
  readyMessage: {
    en: 'AASHTO LRFD kernel ready.',
    zh: 'AASHTO LRFD 内核已就绪。',
  },
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
        { label: { en: 'Drying shrinkage εsh', zh: '干燥收缩 εsh' }, value: current.epsilon_sh, unit: 'με', group: 'shrinkage' },
        { label: { en: 'Total shrinkage εtotal', zh: '总收缩 εtotal' }, value: current.epsilon_total, unit: 'με', group: 'shrinkage', total: true },
      ] : [],
    };
  },
  chartLines: [
    { dataKey: 'psi', stroke: 'var(--series-1)', name: { en: 'Creep Coefficient ψ', zh: '徐变系数 ψ' }, kind: 'compliance' },
    { dataKey: 'epsilon_sh', stroke: 'var(--series-2)', name: { en: 'Drying Shrinkage εsh (με)', zh: '干燥收缩 εsh（με）' }, kind: 'shrinkage' },
  ],
  resultLabel: { en: 'Creep Coefficient ψ(t,ti)', zh: '徐变系数 ψ(t,ti)' },
};

export default function AashtoCalculator({ engine, onEngineFallback }) {
  return <ModelCalculator engine={engine} config={config} onEngineFallback={onEngineFallback} />;
}
