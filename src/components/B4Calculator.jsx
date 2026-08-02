import React from 'react';
import { b4Point } from '../math/creepModels';
import ModelCalculator from './ModelCalculator';

const aggregateOptions = [
  ['Diabase', 'Diabase'],
  ['Quartzite', 'Quartzite'],
  ['Limestone', 'Limestone'],
  ['Sandstone', 'Sandstone'],
  ['Granite', 'Granite'],
  ['Quartz Diorite', 'Quartz Diorite'],
  ['No Information', 'Unknown'],
].map(([value, label]) => ({ value, label }));

const shapeOptions = [
  ['1', 'Infinite Slab'],
  ['2', 'Infinite Cylinder'],
  ['3', 'Infinite Square Prism'],
  ['4', 'Sphere'],
  ['5', 'Cube'],
].map(([value, label]) => ({ value, label }));

const rustAggregateNames = { Diabase: 'Dolerite', Quartzite: 'Quartz' };
const rustShapeNames = {
  1: 'infinite slab',
  2: 'infinite cylinder',
  3: 'infinite square prism',
  4: 'sphere',
  5: 'cube',
};

const chartLines = [
  { dataKey: 'j', stroke: '#2f6f4e', name: 'Compliance J (×10⁻⁶ GPa⁻¹)' },
  { dataKey: 'epsilon_sh', stroke: '#4a9e6e', name: 'Drying Shrinkage εsh (με)' },
  { dataKey: 'epsilon_au', stroke: '#8fc7b8', name: 'Autogenous Shrinkage εau (με)' },
];

const config = {
  name: 'B4 Model',
  descriptions: {
    js: 'B4 compliance and shrinkage calculation with mix design, aggregate, humidity, temperature, and specimen geometry inputs.',
    rust: 'B4 compliance and shrinkage calculation using the Rust WASM kernel for long-range response curves.',
  },
  initialParams: {
    t0: 7, tPrime: 28, T: 20, h: 60, fc: 30, vS: 100, c: 350, wC: 0.5, aC: 4,
    cementType: 'R', aggregateType: 'Quartzite', specimenShape: '2',
  },
  paramsConfig: [
    { name: 't0', label: 'Drying Start Age', min: 1, max: 365, unit: 'Days' },
    { name: 'tPrime', label: 'Age at Loading', min: 1, max: 365, unit: 'Days' },
    { name: 'T', label: 'Temperature', min: -20, max: 60, unit: '°C' },
    { name: 'h', label: 'Relative Humidity', min: 0, max: 100, unit: '%' },
    { name: 'fc', label: 'Concrete Strength', min: 10, max: 100, unit: 'MPa' },
    { name: 'vS', label: 'Volume-Surface Ratio', min: 0.1, max: 1000, unit: 'mm' },
    { name: 'c', label: 'Cement Content', min: 200, max: 600, unit: 'kg/m³' },
    { name: 'wC', label: 'Water-Cement Ratio', min: 0.2, max: 0.8, unit: '' },
    { name: 'aC', label: 'Aggregate-Cement Ratio', min: 1, max: 10, unit: '' },
    {
      name: 'cementType',
      label: 'Cement Type',
      options: [
        { value: 'R', label: 'R (Ordinary)' },
        { value: 'RS', label: 'RS (Rapid)' },
        { value: 'SL', label: 'SL (Slow)' },
      ],
    },
    { name: 'aggregateType', label: 'Aggregate Type', options: aggregateOptions },
    { name: 'specimenShape', label: 'Specimen Shape', options: shapeOptions },
  ],
  loadingMessage: 'Loading Rust B4 Model WASM Module...',
  readyMessage: 'Kernel v2.4 (B4-Rust) initialized successfully.',
  startMessage: (params) => `Initiating B4 calculation with fc=${params.fc}MPa, t0=${params.t0}d`,
  calculateJs(params, maxDays) {
    const results = new Array(maxDays);
    for (let day = 1; day <= maxDays; day += 1) {
      const point = b4Point({ ...params, t: params.tPrime + day });
      results[day - 1] = {
        t: day,
        j: point.J * 1e6,
        epsilon_sh: point.epsilonSH * 1e6,
        epsilon_au: point.epsilonAU * 1e6,
      };
    }
    return results;
  },
  calculateRust(wasm, params, maxDays) {
    const rawResults = wasm.calculate_b4_series({
      t0: params.t0,
      t_prime: params.tPrime,
      t_temp: params.T,
      h: params.h,
      fc: params.fc,
      v_s: params.vS,
      c: params.c,
      w_c: params.wC,
      a_c: params.aC,
      cement_type: params.cementType,
      aggregate_type: rustAggregateNames[params.aggregateType] ?? params.aggregateType,
      specimen_shape: rustShapeNames[params.specimenShape],
    }, maxDays + params.tPrime);

    return rawResults
      .filter((point) => Number.isFinite(point.j))
      .map((point) => ({
        t: point.t,
        j: point.j * 1e6,
        epsilon_sh: point.epsilon_sh * 1e6,
        epsilon_au: point.epsilon_au * 1e6,
      }));
  },
  getSummary(results) {
    const current = results.at(-1);
    return {
      primary: current?.j / 1e6 ?? NaN,
      extraResults: current ? [
        { label: 'Drying Shrinkage εsh (at t_max)', value: current.epsilon_sh / 1e6 },
        { label: 'Autogenous Shrinkage εau (at t_max)', value: current.epsilon_au / 1e6 },
      ] : [],
    };
  },
  chartLines,
  resultLabel: 'Compliance J(t,t′) · 1/GPa',
};

export default function B4Calculator({ engine }) {
  return <ModelCalculator engine={engine} config={config} />;
}
