import React from 'react';
import { b4Point, b4TemperatureAcceleration } from '../math/creepModels';
import { buildB4Params } from '../wasm/creepEngine';
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
  id: 'b4',
  name: 'RILEM Model B4',
  descriptions: {
    js: 'RILEM TC-242-MDC composition-based B4 mean prediction with staged temperatures, Tables 4–6 admixture and aggregate corrections, compliance, and both shrinkage components.',
    rust: 'The complete composition-based B4 mean formulation evaluated by the Rust WASM kernel with absolute concrete-age series.',
  },
  initialParams: {
    t0: 28, tPrime: 28, targetAge: 112, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 27.6,
    vS: 19.05, c: 219.3, wC: 0.6, aC: 7, cementType: 'R',
    aggregateType: 'No Information', specimenShape: '1', retarder: 0, flyAsh: 0,
    superplasticizer: 0, silicaFume: 0, airEntrainingAgent: 0, waterReducer: 0,
  },
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
    { name: 'c', label: 'Cement Content', min: 200, max: 1500, step: 0.1, unit: 'kg/m³' },
    { name: 'wC', label: 'Water-Cement Ratio', min: 0.22, max: 0.87, step: 0.01, unit: '' },
    { name: 'aC', label: 'Aggregate-Cement Ratio', min: 1, max: 13.2, step: 0.1, unit: '' },
    { name: 'cementType', label: 'Cement Reactivity', options: [{ value:'R', label:'R (Regular)' }, { value:'RS', label:'RS (Rapid)' }, { value:'SL', label:'SL (Slow)' }] },
    { name: 'aggregateType', label: 'Aggregate Type', options: aggregateOptions },
    { name: 'specimenShape', label: 'Specimen Shape', options: shapeOptions },
    { name: 'retarder', label: 'Retarder', min: 0, max: 2, step: 0.01, unit: '% c' },
    { name: 'flyAsh', label: 'Fly Ash', min: 0, max: 100, step: 0.1, unit: '% c' },
    { name: 'superplasticizer', label: 'Superplasticizer', min: 0, max: 20, step: 0.1, unit: '% c' },
    { name: 'silicaFume', label: 'Silica Fume', min: 0, max: 30, step: 0.1, unit: '% c' },
    { name: 'airEntrainingAgent', label: 'Air-Entraining Agent', min: 0, max: 2, step: 0.01, unit: '% c' },
    { name: 'waterReducer', label: 'Water Reducer', min: 0, max: 10, step: 0.1, unit: '% c' },
  ],
  loadingMessage: 'Loading Rust RILEM B4 WASM Module…',
  readyMessage: 'RILEM B4 composition-based kernel initialized successfully.',
  startMessage: (params) => `Initiating B4 with fc=${params.fc}MPa, t′=${params.tPrime}d, RH=${params.h}%`,
  calculateJs(params, maxDays) {
    return Array.from({ length:maxDays + 1 }, (_, t) => chartPoint(b4Point({ ...params, t })));
  },
  calculateRust(wasm, params, maxDays) {
    return wasm.calculate_b4_series(buildB4Params(params), maxDays).map(rustChartPoint);
  },
  getSummary(results, params) {
    const current = results[Math.min(results.length - 1, Math.max(0, Math.round(params.targetAge ?? 10000)))];
    /*
     * J = q₁ + β(Tc)·C₀ + C_d, so the instantaneous compliance is only
     * `J − C₀ − C_d` when Tc is the reference 20 °C. Reading it that way showed
     * 64.59 instead of 28.15 at Tc = 30 °C and a negative value at Tc = −25 °C.
     * Undo the temperature factor the kernel applied to C₀ instead.
     */
    const betaTc = b4TemperatureAcceleration(Number(params.Tc));
    const q1 = current ? current.j_micro_mpa - betaTc * current.c0 - current.cd : NaN;
    return {
      primary: current ? current.j_micro_mpa / 1000 : NaN,
      extraResults: current ? [
        { label:'Instantaneous q₁', value:q1, unit:'×10⁻⁶/MPa', group:'compliance' },
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

export default function B4Calculator({ engine, onEngineFallback }) {
  return <ModelCalculator engine={engine} config={config} onEngineFallback={onEngineFallback} />;
}
