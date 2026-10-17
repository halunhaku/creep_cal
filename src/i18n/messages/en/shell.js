/**
 * Shell messages: the chrome that is on screen in every workspace.
 *
 * Identifiers, standards names and units are not translated and do not appear
 * here — `ACI 209R-92`, `φ(t,t₀)`, `MPa` read the same in both languages.
 */
export default {
  /** Kept in step with index.html's static head, which is what a crawler that
   *  does not run JavaScript — and the first paint before React mounts — sees. */
  document: {
    title: 'CREEP LAB | Concrete creep calculator',
    description: 'Multi-model concrete creep and shrinkage platform covering ACI 209R-92, fib Model Code 2010, RILEM B4, B4s, GL2000 and AASHTO LRFD, with batch import and export, decomposed results and an in-app reference library.',
  },
  brand: {
    name: 'CREEP LAB',
    tagline: 'Concrete time-dependent analysis',
  },
  nav: {
    label: 'Workspace',
    single: 'Calculate',
    batch: 'Batch',
    docs: 'Reference',
  },
  skipToContent: 'Skip to content',
  search: {
    label: 'Search commands',
    title: 'Search commands (⌘K)',
    text: 'Search',
  },
  theme: {
    toLight: 'Switch to light theme',
    toDark: 'Switch to dark theme',
  },
  language: {
    /** The control names the language it switches *to*, written in that language. */
    switchLabel: '中文',
    switchTitle: 'Switch to Chinese',
  },
  footer: {
    summary: 'Concrete creep calculation workspace',
    stack: 'Float64 · Rust WASM · JS reference',
  },
  kernel: {
    batchLabel: 'Reference kernels',
    batchTitle: 'Batch rows are evaluated with the JavaScript reference kernels, for all six models. The Rust kernel exposes batch entry points for ACI 209 and MC 2010 only, so using it here would compute different models with different kernels and make the rows incomparable.',
    unavailable: 'WASM unavailable',
    unavailableTitle: 'The Rust kernel failed to load.',
    failedTitle: 'Rust kernel failed: {reason} — the JavaScript reference kernel is in use.',
    idle: 'Kernel idle',
    idleTitle: 'No calculation has run in this session yet.',
    loading: 'Loading WASM…',
    loadingTitle: 'Loading the Rust WebAssembly kernel.',
    wasmReady: 'WASM ready',
    wasmReadyTitle: 'The Rust WebAssembly kernel is loaded and active for the calculation workspace.',
    jsReady: 'JS kernel ready',
    jsReadyTitle: 'The JavaScript reference kernel is active.',
  },
  loading: {
    default: 'Loading…',
    workspace: 'Loading workspace…',
  },
  error: {
    marker: '// Error',
    title: 'Something went wrong',
    body: 'The calculator encountered an unexpected error. Please refresh the page to try again.',
    refresh: 'Refresh page',
    retry: 'Retry',
    details: 'Error details (dev mode)',
  },
  parameterSets: {
    heading: 'Parameter sets',
    reset: 'Reset',
    selectLabel: 'Saved parameter set',
    load: 'Load',
    delete: 'Delete',
    empty: 'No saved sets for this model yet. Name the current parameters to keep a case.',
    namePlaceholder: 'Set name',
    nameLabel: 'New parameter set name',
    save: 'Save',
    defaultName: 'Set {index}',
  },
  palette: {
    dialogLabel: 'Command palette',
    listLabel: 'Commands',
    inputLabel: 'Search commands',
    placeholder: 'Go to a workspace, model, kernel, saved set…',
    noMatch: 'Nothing matches “{query}”.',
    group: {
      goTo: 'Go to',
      model: 'Model',
      kernel: 'Kernel',
      appearance: 'Appearance',
      parameterSet: 'Parameter set',
      reference: 'Reference',
    },
    hint: {
      current: 'current',
      singleCase: 'single case, 10,000-day series',
      datasetPipeline: 'dataset pipeline',
      standards: 'model standards and equations',
      switchModel: 'switch the calculation model',
    },
    command: {
      goSingle: 'Calculate workspace',
      goBatch: 'Batch workspace',
      goDocs: 'Reference library',
      useModel: 'Use {model}',
      kernelRust: 'Use the Rust WASM kernel',
      kernelJs: 'Use the JavaScript reference kernel',
      theme: 'Toggle light / dark theme',
      language: 'Switch to Chinese',
      loadSet: 'Load “{name}”',
      readSection: 'Read {section}',
    },
    section: {
      parameters: 'parameter contract',
      applicability: 'applicability and limitations',
      formulas: 'implemented equations',
      mapping: 'formula source mapping',
      sources: 'official sources',
    },
  },
};
