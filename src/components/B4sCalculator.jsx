import React from 'react';
import { b4sPoint } from '../math/creepModels';
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

const chartLines = [
  { dataKey: 'j', stroke: 'var(--green)', name: 'Compliance J (×10⁻⁶ GPa⁻¹)' },
  { dataKey: 'epsilon_sh', stroke: 'var(--amber)', name: 'Drying Shrinkage εsh (με)' },
  { dataKey: 'epsilon_au', stroke: '#7fb8c9', name: 'Autogenous Shrinkage εau (με)' },
];

const config = {
  name: 'B4S Model',
  descriptions: {
    js: 'Simplified B4 calculation using compressive strength, humidity, aggregate, temperature, and specimen geometry inputs.',
    rust: 'Simplified B4 calculation using the Rust WASM kernel for compliance and shrinkage time series.',
  },
  initialParams: {
    t0: 7, tPrime: 28, T: 20, h: 60, fc: 30, vS: 100,
    cementType: 'R', aggregateType: 'Quartzite', specimenShape: '2',
  },
  paramsConfig: [
    { name: 't0', label: 'Drying Start Age', min: 1, max: 365, unit: 'Days' },
    { name: 'tPrime', label: 'Age at Loading', min: 1, max: 365, unit: 'Days' },
    { name: 'T', label: 'Temperature', min: -20, max: 60, unit: '°C' },
    { name: 'h', label: 'Relative Humidity', min: 0, max: 100, unit: '%' },
    { name: 'fc', label: 'Concrete Strength', min: 10, max: 100, unit: 'MPa' },
    { name: 'vS', label: 'Volume-Surface Ratio', min: 0.1, max: 1000, unit: 'mm' },
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
  loadingMessage: 'Loading Rust B4S Model WASM Module...',
  readyMessage: 'Kernel v2.4 (B4S-Rust) initialized successfully.',
  startMessage: (params) => `Initiating B4S calculation with fc=${params.fc}MPa, t0=${params.t0}d`,
  calculateJs(params, maxDays) {
    const results = new Array(maxDays);
    for (let day = 1; day <= maxDays; day += 1) {
      const point = b4sPoint({ ...params, t: params.tPrime + day });
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
    return wasm.calculate_b4s_series({
      t0: params.t0,
      t_prime: params.tPrime,
      t_temp: params.T,
      h: params.h,
      fc: params.fc,
      v_s: params.vS,
      cement_type: params.cementType,
      aggregate_type: params.aggregateType,
      specimen_shape: params.specimenShape,
    }, maxDays).map((point) => ({
      t: point.t - params.tPrime,
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

export default function B4sCalculator({ engine }) {
  return <ModelCalculator engine={engine} config={config} />;
}
