import React from 'react';
import { b4sPoint } from '../math/creepModels';
import { buildB4sParams } from '../wasm/creepEngine';
import ModelCalculator from './ModelCalculator';

const aggregateOptions = [
  ['Diabase', 'Diabase'],
  ['Quartzite', 'Quartzite'],
  ['Limestone', 'Limestone'],
  ['Sandstone', 'Sandstone'],
  ['Granite', 'Granite'],
  ['Quartz Diorite', 'Quartz Diorite'],
  ['No Information', 'Unknown / no correction'],
].map(([value, label]) => ({ value, label }));

const shapeOptions = [
  ['1', 'Infinite Slab'],
  ['2', 'Infinite Cylinder'],
  ['3', 'Infinite Square Prism'],
  ['4', 'Sphere'],
  ['5', 'Cube'],
].map(([value, label]) => ({ value, label }));

const chartLines = [
  { dataKey: 'j_micro_mpa', stroke: 'var(--primary)', name: 'Compliance J (10⁻⁶/MPa)', kind: 'compliance' },
  { dataKey: 'epsilon_total', stroke: 'var(--text)', name: 'Total Shrinkage εsh,total (με)', kind: 'shrinkage' },
  { dataKey: 'epsilon_sh', stroke: 'var(--accent)', name: 'Drying Shrinkage εsh (με)', kind: 'shrinkage' },
  { dataKey: 'epsilon_au', stroke: 'var(--cyan)', name: 'Autogenous Shrinkage εau (με)', kind: 'shrinkage' },
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

const config = {
  name: 'RILEM Model B4s',
  descriptions: {
    js: 'RILEM TC-242-MDC strength-based B4s mean prediction with staged temperatures, Tables 6–9 parameters, compliance, and total shrinkage.',
    rust: 'The complete strength-based B4s mean formulation evaluated by the Rust WASM kernel with absolute concrete-age series.',
  },
  initialParams: { t0:28, tPrime:28, targetAge:112, Tcur:20, Tsh:20, Tc:20, h:50, fc:27.6, vS:19.05, cementType:'R', aggregateType:'No Information', specimenShape:'1' },
  paramsConfig: [
    { name: 't0', label: 'Drying Start Age', min: 1, max: 365, step: 0.1, unit: 'Days' },
    { name: 'tPrime', label: 'Age at Loading', min: 1, max: 365, step: 0.1, unit: 'Days' },
    { name: 'targetAge', label: 'Target Age', min: 1, max: 10000, step: 1, unit: 'Days' },
    { name: 'Tcur', label: 'Curing Temperature', min: 20, max: 30, step: 0.1, unit: '°C' },
    { name: 'Tsh', label: 'Drying Temperature', min: -25, max: 75, step: 0.1, unit: '°C' },
    { name: 'Tc', label: 'Post-Loading Temperature', min: -25, max: 75, step: 0.1, unit: '°C' },
    { name: 'h', label: 'Relative Humidity', min: 0, max: 98.4, step: 0.1, unit: '%' },
    { name: 'fc', label: 'Mean 28-Day Cylinder Strength', min: 15, max: 70, step: 0.1, unit: 'MPa' },
    { name: 'vS', label: 'Volume-Surface Ratio', min: 12, max: 120, step: 0.01, unit: 'mm' },
    { name: 'cementType', label: 'Cement Reactivity', options: [{ value:'R', label:'R (Regular)' }, { value:'RS', label:'RS (Rapid)' }, { value:'SL', label:'SL (Slow)' }] },
    { name: 'aggregateType', label: 'Aggregate Type', options: aggregateOptions },
    { name: 'specimenShape', label: 'Specimen Shape', options: shapeOptions },
  ],
  loadingMessage: 'Loading Rust RILEM B4s WASM Module...',
  readyMessage: 'RILEM B4s strength-based kernel initialized successfully.',
  startMessage: (params) => `Initiating B4s with fc=${params.fc}MPa, t′=${params.tPrime}d, RH=${params.h}%`,
  calculateJs(params, maxDays) {
    return Array.from({ length:maxDays + 1 }, (_, t) => chartPoint(b4sPoint({ ...params, t })));
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_b4s_series(buildB4sParams(params), maxDays).map(rustChartPoint);
  },
  getSummary(results, targetAge) {
    const current = results[Math.min(results.length - 1, Math.max(0, Math.round(targetAge ?? 10000)))];
    return {
      primary: current ? current.j_micro_mpa / 1000 : NaN,
      extraResults: current ? [
        { label:'Instantaneous q₁', value:current.j_micro_mpa - current.c0 - current.cd, unit:'×10⁻⁶/MPa', group:'compliance' },
        { label:'Basic creep C₀', value:current.c0, unit:'×10⁻⁶/MPa', group:'compliance' },
        { label:'Drying creep Cd', value:current.cd, unit:'×10⁻⁶/MPa', group:'compliance' },
        { label:'Drying shrinkage εsh', value:current.epsilon_sh, unit:'με', group:'shrinkage' },
        { label:'Autogenous shrinkage εau', value:current.epsilon_au, unit:'με', group:'shrinkage' },
        { label:'Total shrinkage εtotal', value:current.epsilon_total, unit:'με', group:'shrinkage', total:true },
      ] : [],
    };
  },
  chartLines,
  resultLabel: 'Compliance J(t,t′) · 1/GPa',
};

export default function B4sCalculator({ engine, onEngineFallback }) {
  return <ModelCalculator engine={engine} config={config} onEngineFallback={onEngineFallback} />;
}
