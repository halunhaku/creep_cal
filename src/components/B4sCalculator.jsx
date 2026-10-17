import React from 'react';
import { b4sPoint, b4TemperatureAcceleration } from '../math/creepModels';
import { buildB4sParams } from '../wasm/creepEngine';
import ModelCalculator from './ModelCalculator';

// Rock names and specimen shapes are content, not chrome: the Chinese is the
// wording the shipped public/模型说明/b4s.md table uses for the same options.
const aggregateOptions = [
  ['Diabase', '辉绿岩'],
  ['Quartzite', '石英岩'],
  ['Limestone', '石灰岩'],
  ['Sandstone', '砂岩'],
  ['Granite', '花岗岩'],
  ['Quartz Diorite', '石英闪长岩'],
  ['No Information', '无信息 / 不修正'],
].map(([value, zh]) => ({ value, label: { en: value === 'No Information' ? 'Unknown / no correction' : value, zh } }));

const shapeOptions = [
  ['1', 'Infinite Slab', '无限大板'],
  ['2', 'Infinite Cylinder', '无限长圆柱'],
  ['3', 'Infinite Square Prism', '无限长方棱柱'],
  ['4', 'Sphere', '球体'],
  ['5', 'Cube', '立方体'],
].map(([value, en, zh]) => ({ value, label: { en, zh } }));

const chartLines = [
  { dataKey: 'j_micro_mpa', stroke: 'var(--series-1)', name: { en: 'Compliance J (10⁻⁶/MPa)', zh: '柔量 J（10⁻⁶/MPa）' }, kind: 'compliance' },
  { dataKey: 'epsilon_total', stroke: 'var(--text)', name: { en: 'Total Shrinkage εsh,total (με)', zh: '总收缩 εsh,total（με）' }, kind: 'shrinkage' },
  { dataKey: 'epsilon_sh', stroke: 'var(--series-2)', name: { en: 'Drying Shrinkage εsh (με)', zh: '干燥收缩 εsh（με）' }, kind: 'shrinkage' },
  { dataKey: 'epsilon_au', stroke: 'var(--series-3)', name: { en: 'Autogenous Shrinkage εau (με)', zh: '自生收缩 εau（με）' }, kind: 'shrinkage' },
];

function chartPoint(point) {
  return {
    t: point.t,
    j_micro_mpa: point.J * 1e6,
    c0: point.C0 * 1e6,
    cd: point.Cd * 1e6,
    epsilon_sh: point.epsilonSH * 1e6,
    epsilon_au: point.epsilonAU * 1e6,
    epsilon_total: point.epsilonTotal * 1e6,
  };
}

function rustChartPoint(point) {
  return {
    t: point.t,
    j_micro_mpa: point.j * 1e6,
    c0: point.c0 * 1e6,
    cd: point.cd * 1e6,
    epsilon_sh: point.epsilon_sh * 1e6,
    epsilon_au: point.epsilon_au * 1e6,
    epsilon_total: point.epsilon_total * 1e6,
  };
}

// Exported so parameterUnits.test.js can compare the documented unit column against
// the real config object instead of regex-parsing this file's text; models.locale.test.jsx
// reads it the same way, which is also why this is not a component-only module.
// eslint-disable-next-line react-refresh/only-export-components -- read directly by the tests
export const config = {
  id: 'b4s',
  name: 'RILEM Model B4s',
  descriptions: {
    js: {
      en: 'RILEM TC-242-MDC strength-based B4s mean prediction with staged temperatures, Tables 6–9 parameters, compliance, and total shrinkage.',
      zh: 'RILEM TC-242-MDC 强度型 B4s 均值预测，含分阶段温度、Tables 6–9 参数、柔量与总收缩。',
    },
    rust: {
      en: 'The complete strength-based B4s mean formulation evaluated by the Rust WASM kernel with absolute concrete-age series.',
      zh: '完整的强度型 B4s 均值公式，由 Rust WASM 内核计算，输出以混凝土绝对龄期为横轴。',
    },
  },
  initialParams: { t0:28, tPrime:28, targetAge:112, Tcur:20, Tsh:20, Tc:20, h:50, fc:27.6, vS:19.05, cementType:'R', aggregateType:'No Information', specimenShape:'1' },
  paramsConfig: [
    { name: 't0', label: { en: 'Drying Start Age', zh: '开始干燥龄期' }, min: 1, max: 365, step: 0.1, unit: 'Days' },
    { name: 'tPrime', label: { en: 'Age at Loading', zh: '加载龄期' }, min: 1, max: 365, step: 0.1, unit: 'Days' },
    { name: 'targetAge', label: { en: 'Target Age', zh: '目标龄期' }, min: 1, max: 10000, step: 1, unit: 'Days' },
    { name: 'Tcur', label: { en: 'Curing Temperature', zh: '养护期温度' }, min: 20, max: 30, step: 0.1, unit: '°C' },
    { name: 'Tsh', label: { en: 'Drying Temperature', zh: '干燥期温度' }, min: -25, max: 75, step: 0.1, unit: '°C' },
    { name: 'Tc', label: { en: 'Post-Loading Temperature', zh: '受荷期温度' }, min: -25, max: 75, step: 0.1, unit: '°C' },
    { name: 'h', label: { en: 'Relative Humidity', zh: '相对湿度' }, min: 0, max: 98.4, step: 0.1, unit: '%' },
    { name: 'fc', label: { en: 'Mean 28-Day Cylinder Strength', zh: '28d圆柱体平均抗压强度' }, min: 15, max: 70, step: 0.1, unit: 'MPa' },
    { name: 'vS', label: { en: 'Volume-Surface Ratio', zh: '体积表面积比' }, min: 12, max: 120, step: 0.01, unit: 'mm' },
    { name: 'cementType', label: { en: 'Cement Reactivity', zh: '水泥水化活性' }, options: [
      { value:'R', label: { en:'R (Regular)', zh:'R（普通）' } },
      { value:'RS', label: { en:'RS (Rapid)', zh:'RS（快硬）' } },
      { value:'SL', label: { en:'SL (Slow)', zh:'SL（慢硬）' } },
    ] },
    { name: 'aggregateType', label: { en: 'Aggregate Type', zh: '骨料类型' }, options: aggregateOptions },
    { name: 'specimenShape', label: { en: 'Specimen Shape', zh: '试件形状系数' }, options: shapeOptions },
  ],
  readyMessage: {
    en: 'RILEM B4s strength-based kernel initialized successfully.',
    zh: 'RILEM B4s 强度型内核初始化成功。',
  },
  calculateJs(params, maxDays) {
    return Array.from({ length:maxDays + 1 }, (_, t) => chartPoint(b4sPoint({ ...params, t })));
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_b4s_series(buildB4sParams(params), maxDays).map(rustChartPoint);
  },
  getSummary(results, params) {
    const current = results[Math.min(results.length - 1, Math.max(0, Math.round(params.targetAge ?? 10000)))];
    // See B4Calculator: q₁ = J − β(Tc)·C₀ − C_d, not J − C₀ − C_d.
    const betaTc = b4TemperatureAcceleration(Number(params.Tc));
    const q1 = current ? current.j_micro_mpa - betaTc * current.c0 - current.cd : NaN;
    return {
      primary: current ? current.j_micro_mpa / 1000 : NaN,
      extraResults: current ? [
        { label: { en:'Instantaneous q₁', zh:'瞬时 q₁' }, value:q1, unit:'×10⁻⁶/MPa', group:'compliance' },
        { label: { en:'Basic creep C₀', zh:'基本徐变 C₀' }, value:current.c0, unit:'×10⁻⁶/MPa', group:'compliance' },
        { label: { en:'Drying creep Cd', zh:'干燥徐变 Cd' }, value:current.cd, unit:'×10⁻⁶/MPa', group:'compliance' },
        { label: { en:'Drying shrinkage εsh', zh:'干燥收缩 εsh' }, value:current.epsilon_sh, unit:'με', group:'shrinkage' },
        { label: { en:'Autogenous shrinkage εau', zh:'自生收缩 εau' }, value:current.epsilon_au, unit:'με', group:'shrinkage' },
        { label: { en:'Total shrinkage εtotal', zh:'总收缩 εtotal' }, value:current.epsilon_total, unit:'με', group:'shrinkage', total:true },
      ] : [],
    };
  },
  chartLines,
  resultLabel: { en: 'Compliance J(t,t′) · 1/GPa', zh: '柔量 J(t,t′) · 1/GPa' },
};

export default function B4sCalculator({ engine, onEngineFallback }) {
  return <ModelCalculator engine={engine} config={config} onEngineFallback={onEngineFallback} />;
}
