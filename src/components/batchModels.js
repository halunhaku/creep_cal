// Batch model registry: the input contract, result columns and shipped sample
// files for each prediction model. Lives outside BatchCalculator.jsx so the
// component file exports only components (React Fast Refresh) while tests can
// still assert the registry against what actually ships in public/模型示例/.
// Display-only labels: CSV column names and kernel contracts stay language-neutral.
const coefficient = { en: 'φ (Creep Coeff.)', zh: 'φ（徐变系数）' };
const shrinkage = [
  { en: 'εsh (Drying)', zh: 'εsh（干燥收缩）' },
  { en: 'εau (Autogenous)', zh: 'εau（自生收缩）' },
  { en: 'εsh,total', zh: 'εsh,total（总收缩）' },
];
const compliance = [{ en: 'J (1/GPa)', zh: 'J（1/GPa）' }, ...shrinkage];
const labelsByModel = {
  aci209: [coefficient],
  mc2010: [
    { en: 'φ (Total)', zh: 'φ（总徐变）' },
    { en: 'φbc (Basic)', zh: 'φbc（基本徐变）' },
    { en: 'φdc (Drying)', zh: 'φdc（干燥徐变）' },
    { en: 'Nonlinear Factor', zh: '非线性系数' },
  ],
  b4: compliance,
  b4s: compliance,
  gl2000: compliance,
  aashto: [{ en: 'ψ (Creep Coeff.)', zh: 'ψ（徐变系数）' }, ...shrinkage],
};

export const MODELS = [
  { id: 'aci209', name: 'ACI 209R-92',  sampleFiles: ['aci209示例.csv', 'aci209示例.xlsx'], resultKeys: ['result_phi'],           req: 'curingType, t0, H, VS, slump, fineAggregate, airContent, t', template: ['moist', 28, 70, 100, 100, 50, 8, 365] },
  { id: 'mc2010', name: 'fib MC 2010',  sampleFiles: ['mc2010示例.csv', 'mc2010示例.xlsx'], resultKeys: ['result_phi', 'result_phi_bc', 'result_phi_dc', 'result_nonlinear_factor'], req: 'fcm, RH, t0, Ac, u, T, Cs, sigma, t', template: [40, 70, 28, 90000, 1200, 20, '42.5 R', 12, 365] },
  { id: 'b4', name: 'RILEM B4', sampleFiles: ['B4示例.csv', 'B4示例.xlsx'], resultKeys: ['result_J_GPa', 'result_epsilonSH', 'result_epsilonAU', 'result_epsilonTotal'], req: 't0, tPrime, Tcur, Tsh, Tc, h, fc, vS, c, wC, aC, cementType, aggregateType, specimenShape, retarder, flyAsh, superplasticizer, silicaFume, airEntrainingAgent, waterReducer, t', template: [28, 28, 20, 20, 20, 50, 27.6, 19.05, 219.3, 0.6, 7, 'R', 'No Information', '1', 0, 0, 0, 0, 0, 0, 112] },
  { id: 'b4s', name: 'RILEM B4s', sampleFiles: ['B4s示例.csv', 'B4s示例.xlsx'], resultKeys: ['result_J_GPa', 'result_epsilonSH', 'result_epsilonAU', 'result_epsilonTotal'], req: 't0, tPrime, Tcur, Tsh, Tc, h, fc, vS, cementType, aggregateType, specimenShape, t', template: [28, 28, 20, 20, 20, 50, 27.6, 19.05, 'R', 'No Information', '1', 112] },
  { id: 'gl2000', name: 'GL2000', sampleFiles: ['GL2000示例.csv', 'GL2000示例.xlsx'], resultKeys: ['result_J_GPa', 'result_epsilonSH', 'result_epsilonAU', 'result_epsilonTotal'], req: 'fcm28, h, vs, tc, t0, cementType, t', template: [32.5, 70, 100, 7, 28, 'I', 365] },
  { id: 'aashto', name: 'AASHTO LRFD', sampleFiles: ['AASHTO示例.csv', 'AASHTO示例.xlsx'], resultKeys: ['result_psi', 'result_epsilonSH', 'result_epsilonAU', 'result_epsilonTotal'], req: 'fci, H, vs, ti, tc, t', template: [41, 70, 89, 7, 7, 365] },
].map((model) => ({ ...model, labels: labelsByModel[model.id] }));
