/**
 * Calculation workspace messages: the model picker, the parameter grid, the result
 * panel and its chart.
 *
 * Per-model technical content — a parameter's label, a model's description, the
 * name of a chart series — is not here. It belongs with the model, in that model's
 * own config, because a parameter's label and its calibrated range are one fact and
 * separating them lets them drift. Those configs carry `{ en, zh }` values resolved
 * by `pick()` in i18n/pick.js.
 */
export default {
  dashboard: {
    eyebrow: 'Calculation workspace',
    title: 'Time-dependent concrete analysis',
    intro: 'Select a prediction model, define calibrated inputs, then explicitly calculate the complete 10,000-day response.',
    precision: 'Float64 · 0–10,000 days',
    modelsEyebrow: 'Prediction model',
    modelsLabel: 'Prediction models',
    activeModel: 'Active model',
    calibrated: 'Calibrated · {range}',
    kernel: 'Kernel',
    rustTab: 'Rust WASM',
    jsTab: 'JS Ref.',
    loadingModel: 'Loading model…',
  },
  calculator: {
    engineRust: 'Rust WebAssembly',
    engineJs: 'JavaScript reference',
    lastCompute: 'Last compute',
    calculatedAt: 'Calculated at',
    defaultResult: 'Creep coefficient φ',
    days: '{value} days',
    vsPrevious: 'vs previous run',
    computed: 'Computed',
    stale: 'Results out of date',
    totalShrinkage: 'Total shrinkage',
    changedSinceRun: 'Changed since last run',
    decomposition: {
      compliance: 'Compliance decomposition',
      shrinkage: 'Shrinkage decomposition',
      fallback: 'Result components',
    },
    copy: {
      value: 'Copy value',
      text: 'Copy',
      done: 'Copied',
      label: 'Copy {label}',
    },
    units: {
      days: 'days',
      dimensionless: 'dimensionless',
    },
    chart: {
      compliance: 'Compliance',
      response: 'Response',
      shrinkage: 'Shrinkage',
      data: 'Data',
      logX: 'Log X',
      linearX: 'Linear X',
      logY: 'Log Y',
      linearY: 'Linear Y',
      logYBlocked: 'Log Y unavailable for signed shrinkage values',
      export: 'Export CSV',
      showing: 'Showing {shown} of {total} computed points · every {stride} days, plus the target age. Export CSV contains the full series.',
      timeColumn: 'Time · days',
      previous: '{name} · prev',
      axisTime: 'Concrete age · days',
      axisValue: 'Series value',
      tooltipTime: 't = {days} days',
      referenceLoad: 't₀ {days}d',
      referenceLoading: 't′ {days}d',
      // Recharts' Brush labels its two drag handles from the series data and
      // renders "Min value: undefined, Max value: undefined" when the data has no
      // `name` field — which announced as that literal string to a screen reader.
      // This replaces it. The handles stay `role="slider"`; min/max/now/text in
      // data units are patched onto the rendered DOM by `brushA11y.js`, because
      // Recharts hardcodes only `aria-label` and a pixel `aria-valuenow`.
      brushRange: 'Series range',
    },
    comparison: {
      title: 'Kernel comparison',
      note: 'Each kernel runs the same parameters once over {days} days (including warm-up).',
      jsOnly: 'JS-only model — no Rust kernel to compare against.',
      measure: 'Measuring…',
      run: 'Compare kernels',
      js: 'JS reference',
      rust: 'Rust WASM',
      speedup: 'Rust speed-up',
    },
    notice: {
      dismiss: 'Dismiss',
      kernelTitle: 'Rust WebAssembly kernel unavailable',
      kernelFallback: '{detail} — switched to the JavaScript reference implementation; results are still valid. You can also click “Rust WASM” on the left to retry.',
      calcTitle: 'Calculation failed',
      compareTitle: 'Kernel comparison failed',
    },
    log: {
      title: 'Calculation log',
      events: { one: '{count} event', other: '{count} events' },
      kernelReadyRust: 'Rust WebAssembly kernel ready for initialization.',
      kernelReadyJs: 'JavaScript reference kernel ready.',
      wasmFailed: 'WASM initialization failed: {detail}',
      kernelNotReady: 'Rust WebAssembly kernel is not ready.',
      calcDone: 'Calculation completed in {ms} ms.',
      calcFailed: 'Calculation failed: {detail}',
      compareDone: 'Kernel comparison over {days} days: JS {js} ms vs Rust {rust} ms.',
      compareFailed: 'Kernel comparison failed: {detail}',
    },
    button: {
      calculate: 'Calculate',
      kernelUnavailable: 'Kernel unavailable',
      loadingKernel: 'Loading kernel…',
    },
  },
  parameters: {
    eyebrow: 'Input parameters',
    checked: 'Ranges are checked before the calculation runs',
    count: '{count} inputs',
    active: '{count} active',
    recommended: 'Recommended {min}–{max}{unit}',
    outOfRange: 'Outside calibrated range {min}–{max}',
    changed: 'Inputs changed',
    stale: 'results are out of date',
    requireAttention: { one: '{count} input requires attention', other: '{count} inputs require attention' },
    outOfRangeButton: 'Inputs out of range',
    group: {
      time: 'Time',
      temperature: 'Temperature',
      environment: 'Environment',
      geometry: 'Geometry',
      material: 'Material',
      admixtures: 'Admixtures',
    },
  },
};
