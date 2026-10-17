// Language-neutral model and section ids are the navigation contract. Wording
// lives in Markdown; these ids never depend on a translated heading or a slug.
export const DOCUMENTS = [
  { id: 'aci209', name: 'ACI 209R-92', category: { en: 'North American Standard', zh: '北美标准' }, sections: ['overview', 'documents', 'scope', 'parameters', 'formulas', 'loading-age', 'humidity', 'size', 'mix', 'outputs', 'applicability', 'sources'] },
  { id: 'mc2010', name: 'fib Model Code 2010', category: { en: 'fib International Model Code', zh: 'fib 国际模式规范' }, sections: ['overview', 'documents', 'parameters', 'cement', 'formulas', 'outputs', 'example', 'applicability', 'sources'] },
  { id: 'b4', name: 'RILEM Model B4', category: { en: 'RILEM Multi-Decade Model', zh: 'RILEM 多年代模型' }, sections: ['overview', 'parameters', 'outputs', 'formulas', 'temperature', 'elasticity', 'basic-creep', 'drying-creep', 'shrinkage', 'example', 'sources'] },
  { id: 'b4s', name: 'RILEM Model B4s', category: { en: 'Strength-Based Simplified Model', zh: '基于强度的简化模型' }, sections: ['overview', 'parameters', 'formulas', 'coefficients', 'sources'] },
  { id: 'gl2000', name: 'GL2000', category: { en: 'Gardner–Lockman Model', zh: 'Gardner–Lockman 模型' }, sections: ['overview', 'documents', 'scope', 'parameters', 'formulas', 'outputs', 'applicability', 'sources'] },
  { id: 'aashto', name: 'AASHTO LRFD', category: { en: 'Bridge Design Specification', zh: '桥梁设计规范' }, sections: ['overview', 'documents', 'scope', 'parameters', 'formulas', 'outputs', 'applicability', 'sources'] },
];

export function documentUrl(modelId, locale) {
  if (!DOCUMENTS.some((model) => model.id === modelId) || !['en', 'zh'].includes(locale)) {
    throw new Error('Unknown documentation model or language');
  }
  // The original Chinese URLs remain public, backwards-compatible downloads.
  return encodeURI(`/模型说明/${locale === 'en' ? 'en/' : ''}${modelId}.md`);
}
