import React from 'react';
import { aci209Phi } from '../math/creepModels';
import { buildAci209Params } from '../wasm/creepEngine';
import ModelCalculator from './ModelCalculator';

const curingOptions = [
  { value: 'moist', label: { en: 'Moist Cured', zh: '湿养护' } },
  { value: 'steam', label: { en: 'Steam Cured', zh: '蒸汽养护' } },
];

// Exported so parameterUnits.test.js can compare the documented unit column against
// the real config object instead of regex-parsing this file's text; models.locale.test.jsx
// reads it the same way, which is also why this is not a component-only module.
// eslint-disable-next-line react-refresh/only-export-components -- read directly by the tests
export const config = {
  id: 'aci209',
  name: 'ACI 209R',
  descriptions: {
    js: {
      en: 'Official ACI 209R-92 creep coefficient using curing, loading age, humidity, member size, slump, fine aggregate, and air content corrections.',
      zh: '按 ACI 209R-92 官方公式计算徐变系数，包含养护方式、加载龄期、湿度、构件尺寸、坍落度、细骨料与含气量修正。',
    },
    rust: {
      en: 'Official ACI 209R-92 creep coefficient using the Rust WASM kernel for the 10000-day concrete-age series.',
      zh: 'ACI 209R-92 官方徐变系数，由 Rust WASM 内核计算 10000 天混凝土龄期序列。',
    },
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
  // The Chinese labels are the ones the shipped notes already use in their input
  // table, so the grid and public/模型说明/aci209.md name the same field the same way.
  paramsConfig: [
    { name: 'curingType', label: { en: 'Curing Type', zh: '养护方式' }, options: curingOptions },
    { name: 't0', label: { en: 'Age at Loading', zh: '加载龄期' }, min: 1, max: 365, unit: 'Days' },
    { name: 'targetAge', label: { en: 'Target Age', zh: '目标龄期' }, min: 1, max: 10000, unit: 'Days' },
    { name: 'H', label: { en: 'Relative Humidity', zh: '相对湿度' }, min: 0, max: 100, unit: '%' },
    { name: 'VS', label: { en: 'Volume-Surface Ratio', zh: '体积表面积比' }, min: 1, max: 1000, unit: 'mm' },
    { name: 'slump', label: { en: 'Concrete Slump', zh: '坍落度' }, min: 0, max: 300, unit: 'mm' },
    { name: 'fineAggregate', label: { en: 'Fine Aggregate', zh: '细骨料百分比' }, min: 0, max: 100, unit: '%' },
    { name: 'airContent', label: { en: 'Air Content', zh: '含气量' }, min: 0, max: 20, unit: '%' },
  ],
  readyMessage: {
    en: 'Kernel v2.4 (ACI209-Rust) initialized successfully.',
    zh: '内核 v2.4（ACI209-Rust）初始化成功。',
  },
  calculateJs(params, maxDays) {
    const results = new Array(maxDays + 1);
    for (let t = 0; t <= maxDays; t += 1) {
      results[t] = { t, phi: aci209Phi({ ...params, t }) };
    }
    return results;
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_aci209_series(buildAci209Params(params), maxDays);
  },
  getSummary(results, params) {
    const targetAge = params.targetAge;
    const current = results[Math.min(results.length - 1, Math.max(0, Math.round(targetAge ?? 10000)))];
    return { primary: current?.phi ?? NaN };
  },
  chartLines: [{ dataKey: 'phi', stroke: 'var(--series-1)', name: { en: 'Creep Coefficient φ', zh: '徐变系数 φ' } }],
};

export default function Aci209Calculator({ engine, onEngineFallback }) {
  return <ModelCalculator engine={engine} config={config} onEngineFallback={onEngineFallback} />;
}
