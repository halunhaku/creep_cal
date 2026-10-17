/**
 * 外壳文案：在每个工作区都可见的框架部分。
 *
 * 标识符、标准名与单位不翻译，也不出现在这里——`ACI 209R-92`、`φ(t,t₀)`、`MPa`
 * 在两种语言下写法相同。
 */
export default {
  /** 与 index.html 的静态 head 保持一致——不执行 JavaScript 的爬虫，以及 React
   *  挂载前的首次绘制，看到的都是那一份。 */
  document: {
    title: 'CREEP LAB | 混凝土徐变计算器',
    description: '混凝土徐变多模型平台，集成ACI209、MC2010、B4、B4S等主流模型，支持批量导入导出、可视化，适用于科研与工程设计。',
  },
  brand: {
    name: 'CREEP LAB',
    tagline: '混凝土时变分析',
  },
  nav: {
    label: '工作区',
    single: '计算',
    batch: '批量',
    docs: '参考',
  },
  skipToContent: '跳到主要内容',
  search: {
    label: '搜索命令',
    title: '搜索命令（⌘K）',
    text: '搜索',
  },
  theme: {
    toLight: '切换到浅色主题',
    toDark: '切换到深色主题',
  },
  language: {
    /** 控件显示它将要切换到的语言，并用该语言自身书写。 */
    switchLabel: 'English',
    switchTitle: '切换到英文',
  },
  footer: {
    summary: '混凝土徐变计算工作区',
    stack: 'Float64 · Rust WASM · JS 参考实现',
  },
  kernel: {
    batchLabel: 'JavaScript 参考内核',
    batchTitle: '批量行由 JavaScript 参考内核计算，六种模型一致。Rust 内核只为 ACI 209 与 MC 2010 提供批量入口，若在此使用，不同模型会由不同内核计算，行与行之间不再可比。',
    unavailable: 'WASM 不可用',
    unavailableTitle: 'Rust 内核加载失败。',
    failedTitle: 'Rust 内核失败：{reason} —— 已改用 JavaScript 参考实现。',
    idle: '内核空闲',
    idleTitle: '本次会话尚未执行计算。',
    loading: '正在加载 WASM…',
    loadingTitle: '正在加载 Rust WebAssembly 内核。',
    wasmReady: 'WASM 就绪',
    wasmReadyTitle: 'Rust WebAssembly 内核已加载，计算工作区正在使用它。',
    jsReady: 'JS 内核就绪',
    jsReadyTitle: '正在使用 JavaScript 参考内核。',
  },
  loading: {
    default: '加载中…',
    workspace: '正在加载工作区…',
  },
  error: {
    marker: '// 错误',
    title: '出现了异常',
    body: '计算器遇到未预期的错误。请刷新页面后重试。',
    refresh: '刷新页面',
    retry: '重试',
    details: '错误详情（开发模式）',
  },
  parameterSets: {
    heading: '参数集',
    reset: '重置',
    selectLabel: '已保存的参数集',
    load: '载入',
    delete: '删除',
    empty: '该模型还没有保存的参数集。为当前参数命名即可保留一组工况。',
    namePlaceholder: '参数集名称',
    nameLabel: '新参数集名称',
    save: '保存',
    defaultName: '参数集 {index}',
  },
  palette: {
    dialogLabel: '命令面板',
    listLabel: '命令',
    inputLabel: '搜索命令',
    placeholder: '跳转到工作区、模型、内核、已保存参数集…',
    noMatch: '没有与“{query}”匹配的命令。',
    group: {
      goTo: '跳转到',
      model: '模型',
      kernel: '内核',
      appearance: '外观',
      parameterSet: '参数集',
      reference: '参考文档',
    },
    hint: {
      current: '当前',
      singleCase: '单点工况，10000 天序列',
      datasetPipeline: '数据集流水线',
      standards: '模型标准与公式',
      switchModel: '切换计算模型',
    },
    command: {
      goSingle: '计算工作区',
      goBatch: '批量工作区',
      goDocs: '参考库',
      useModel: '使用 {model}',
      kernelRust: '使用 Rust WASM 内核',
      kernelJs: '使用 JavaScript 参考内核',
      theme: '在浅色 / 深色主题间切换',
      language: '切换到英文',
      loadSet: '载入“{name}”',
      readSection: '查看{section}',
    },
    section: {
      parameters: '参数约定',
      applicability: '适用范围与限制',
      formulas: '已实现的公式',
      mapping: '公式来源对照',
      sources: '官方来源',
    },
  },
};
