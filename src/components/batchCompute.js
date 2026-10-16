import {
  aashtoSingle,
  aci209Single,
  b4Single,
  b4sSingle,
  gl2000Single,
  mc2010Single,
} from '../math/creepModels';

// Pure row computation shared by the main-thread fallback and the batch
// Worker. No React/store imports: this module must stay importable inside a
// Vite `?worker` entry without dragging recharts/katex into the bundle.

// A row is only "valid" when every output is a finite number. Silently writing
// the literal string "NaN" into the result matrix hides broken input rows.
export function formatResult(value, digits, label) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} could not be evaluated from these inputs · 输入无法产生有效结果`);
  }
  return value.toFixed(digits);
}

export function computeRow(modelId, row) {
  if (modelId === 'aci209') {
    return { result_phi: formatResult(aci209Single(row), 4, 'φ (Creep Coeff.)') };
  }
  if (modelId === 'mc2010') {
    const { phi, phi_bc: phiBc, phi_dc: phiDc, nonlinear_factor: nonlinearFactor } = mc2010Single(row);
    return {
      result_phi: formatResult(phi, 4, 'φ (Total)'),
      result_phi_bc: formatResult(phiBc, 4, 'φbc (Basic)'),
      result_phi_dc: formatResult(phiDc, 4, 'φdc (Drying)'),
      result_nonlinear_factor: formatResult(nonlinearFactor, 4, 'Nonlinear Factor'),
    };
  }
  if (modelId === 'b4') {
    const { J_GPa: JGPa, epsilonSH, epsilonAU, epsilonTotal } = b4Single(row);
    return {
      result_J_GPa: formatResult(JGPa, 6, 'J (1/GPa)'),
      result_epsilonSH: formatResult(epsilonSH, 9, 'εsh (Drying)'),
      result_epsilonAU: formatResult(epsilonAU, 9, 'εau (Autogenous)'),
      result_epsilonTotal: formatResult(epsilonTotal, 9, 'εsh,total'),
    };
  }
  if (modelId === 'b4s') {
    const { J_GPa: JGPa, epsilonSH, epsilonAU, epsilonTotal } = b4sSingle(row);
    return {
      result_J_GPa: formatResult(JGPa, 6, 'J (1/GPa)'),
      result_epsilonSH: formatResult(epsilonSH, 9, 'εsh (Drying)'),
      result_epsilonAU: formatResult(epsilonAU, 9, 'εau (Autogenous)'),
      result_epsilonTotal: formatResult(epsilonTotal, 9, 'εsh,total'),
    };
  }
  if (modelId === 'gl2000') {
    // No autogenous term in GL2000: epsilonAU is an explicit 0, exactly as
    // the kernel returns it, so the matrix keeps the B4 column shape.
    const { J_GPa: JGPa, epsilonSH, epsilonAU, epsilonTotal } = gl2000Single(row);
    return {
      result_J_GPa: formatResult(JGPa, 6, 'J (1/GPa)'),
      result_epsilonSH: formatResult(epsilonSH, 9, 'εsh (Drying)'),
      result_epsilonAU: formatResult(epsilonAU, 9, 'εau (Autogenous)'),
      result_epsilonTotal: formatResult(epsilonTotal, 9, 'εsh,total'),
    };
  }
  if (modelId === 'aashto') {
    // Coefficient model like ACI 209: ψ plus the shrinkage triplet, with the
    // same explicit-zero autogenous the GL2000 branch uses for column shape.
    const { psi, epsilonSH, epsilonAU, epsilonTotal } = aashtoSingle(row);
    return {
      result_psi: formatResult(psi, 4, 'ψ (Creep Coeff.)'),
      result_epsilonSH: formatResult(epsilonSH, 9, 'εsh (Drying)'),
      result_epsilonAU: formatResult(epsilonAU, 9, 'εau (Autogenous)'),
      result_epsilonTotal: formatResult(epsilonTotal, 9, 'εsh,total'),
    };
  }
  return {};
}

/**
 * Compute one chunk of rows. Shared by the main-thread fallback and the
 * Worker so both paths produce byte-identical results and issues.
 * @returns {{results: object[], issues: object[]}}
 */
export function computeRowsChunk(modelId, rows, startRowNumber = 2) {
  const issues = [];
  const results = rows.map((row, index) => {
    try {
      return { ...row, ...computeRow(modelId, row), __status: 'valid' };
    } catch (error) {
      issues.push({ row: startRowNumber + index, field: 'Input', value: '—', message: error.message });
      return { ...row, __status: 'invalid' };
    }
  });
  return { results, issues };
}
