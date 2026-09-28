/**
 * CREEP_LAB — Shared Math Kernels
 * Single source of truth for all JS creep/shrinkage computations.
 * Used by: BatchCalculator, individual JS calculators, and any future tools.
 */

// ─── ACI 209R-92 ────────────────────────────────────────────────────────────
/**
 * ACI 209R-92 creep coefficient for moist- or steam-cured concrete.
 *
 * @param {object} params
 * @param {'moist'|'steam'} params.curingType Curing method
 * @param {number} params.t0 Age at loading (days)
 * @param {number} params.H Relative humidity (%)
 * @param {number} params.VS Volume-to-exposed-surface ratio (mm)
 * @param {number} params.slump Concrete slump (mm)
 * @param {number} params.fineAggregate Fine aggregate / total aggregate by weight (%)
 * @param {number} params.airContent Air content (%)
 * @param {number} params.t Concrete age at evaluation (days)
 * @returns {number} φ(t, t₀) — creep coefficient
 */
export function aci209Phi({ curingType, t0, H, VS, slump, fineAggregate, airContent, t }) {
  const dt = t - t0;
  if (dt <= 0) return 0;

  let loadingAgeFactor;
  if (curingType === 'moist') {
    loadingAgeFactor = t0 <= 7 ? 1 : 1.25 * Math.pow(t0, -0.118);
  } else if (curingType === 'steam') {
    loadingAgeFactor = t0 <= 3 ? 1 : 1.13 * Math.pow(t0, -0.094);
  } else {
    throw new RangeError(`Unsupported ACI 209R-92 curing type: ${curingType}`);
  }

  const humidityFactor = H <= 40 ? 1 : 1.27 - 0.0067 * H;
  const sizeFactor = (2 * (1 + 1.13 * Math.exp(-0.0213 * VS))) / 3;
  const slumpFactor = 0.82 + 0.00264 * slump;
  const fineAggregateFactor = 0.88 + 0.0024 * fineAggregate;
  const airContentFactor = Math.max(1, 0.46 + 0.09 * airContent);
  const ultimateCreep = 2.35
    * loadingAgeFactor
    * humidityFactor
    * sizeFactor
    * slumpFactor
    * fineAggregateFactor
    * airContentFactor;
  const timeFactor = Math.pow(dt, 0.6) / (10 + Math.pow(dt, 0.6));
  return timeFactor * ultimateCreep;
}

/** Single-row version for batch use (accepts row object). */
export function aci209Single({ curingType, t0, H, VS, slump, fineAggregate, airContent, t }) {
  return aci209Phi({
    curingType: String(curingType).trim().toLowerCase(),
    t0: parseFloat(t0),
    H: parseFloat(H),
    VS: parseFloat(VS),
    slump: parseFloat(slump),
    fineAggregate: parseFloat(fineAggregate),
    airContent: parseFloat(airContent),
    t: parseFloat(t),
  });
}

// ─── fib Model Code 2010 ────────────────────────────────────────────────────
const MC2010_CEMENT_ALPHA = {
  '32.5 N': -1,
  '32.5 R': 0,
  '42.5 N': 0,
  '42.5 R': 1,
  '52.5 N': 1,
  '52.5 R': 1,
};

function validateMc2010({ fcm, RH, t0, Ac, u, T, Cs, sigma }) {
  if (!Number.isFinite(fcm) || fcm < 20 || fcm > 130) {
    throw new RangeError('MC2010 requires 20 ≤ fcm ≤ 130 MPa.');
  }
  if (!Number.isFinite(RH) || RH < 40 || RH > 100) {
    throw new RangeError('MC2010 requires 40 ≤ RH ≤ 100%.');
  }
  if (!Number.isFinite(t0) || t0 < 1) {
    throw new RangeError('MC2010 requires t0 ≥ 1 day.');
  }
  if (!Number.isFinite(Ac) || Ac <= 0 || !Number.isFinite(u) || u <= 0) {
    throw new RangeError('MC2010 requires positive Ac and u values.');
  }
  if (!Number.isFinite(T) || T < 5 || T > 30) {
    throw new RangeError('MC2010 standard creep model requires 5 ≤ T ≤ 30°C.');
  }
  if (!(Cs in MC2010_CEMENT_ALPHA)) {
    throw new RangeError(`Unsupported MC2010 cement class: ${Cs}`);
  }
  if (!Number.isFinite(sigma) || Math.abs(sigma) > 0.6 * fcm) {
    throw new RangeError('MC2010 requires |sigma| ≤ 0.6 fcm.');
  }
}

/**
 * Published fib Model Code 2010 creep formulation, Eqs. 5.1-63–5.1-74.
 * T is the constant curing temperature before loading; t is concrete age.
 *
 * @returns {{t:number, phi:number, phi_bc:number, phi_dc:number,
 *   nonlinear_factor:number, t0_adjusted:number}}
 */
export function mc2010Point({ fcm, RH, t0, Ac, u, T, Cs, sigma, t }) {
  validateMc2010({ fcm, RH, t0, Ac, u, T, Cs, sigma });
  if (!Number.isFinite(t)) {
    throw new RangeError('MC2010 requires a finite concrete age t.');
  }

  const alpha = MC2010_CEMENT_ALPHA[Cs];
  const temperatureAdjustedAge = t0 * Math.exp(13.65 - 4000 / (273 + T));
  const t0Adjusted = Math.max(
    temperatureAdjustedAge
      * Math.pow((9 / (2 + Math.pow(temperatureAdjustedAge, 1.2))) + 1, alpha),
    0.5,
  );
  const stressRatio = Math.abs(sigma / fcm);
  const nonlinearFactor = stressRatio > 0.4
    ? Math.exp(1.5 * (stressRatio - 0.4))
    : 1;
  const elapsed = t - t0;

  if (elapsed <= 0) {
    return {
      t,
      phi: 0,
      phi_bc: 0,
      phi_dc: 0,
      nonlinear_factor: nonlinearFactor,
      t0_adjusted: t0Adjusted,
    };
  }

  const notionalSize = (2 * Ac) / u;
  const alphaFcm = Math.sqrt(35 / fcm);
  const betaH = Math.min(
    1.5 * notionalSize + 250 * alphaFcm,
    1500 * alphaFcm,
  );
  const phiBc = (1.8 / Math.pow(fcm, 0.7))
    * Math.log(Math.pow((30 / t0Adjusted) + 0.035, 2) * elapsed + 1);
  const gammaT0 = 1 / (2.3 + 3.5 / Math.sqrt(t0Adjusted));
  const phiDc = (412 / Math.pow(fcm, 1.4))
    * ((1 - RH / 100) / Math.pow(0.1 * (notionalSize / 100), 1 / 3))
    * (1 / (0.1 + Math.pow(t0Adjusted, 0.2)))
    * Math.pow(elapsed / (betaH + elapsed), gammaT0);

  return {
    t,
    phi: (phiBc + phiDc) * nonlinearFactor,
    phi_bc: phiBc,
    phi_dc: phiDc,
    nonlinear_factor: nonlinearFactor,
    t0_adjusted: t0Adjusted,
  };
}

/** Single-row version for batch use (accepts row object). */
export function mc2010Single({ fcm, RH, t0, Ac, u, T, Cs, sigma, t }) {
  return mc2010Point({
    fcm: parseFloat(fcm),
    RH: parseFloat(RH),
    t0: parseFloat(t0),
    Ac: parseFloat(Ac),
    u: parseFloat(u),
    T: parseFloat(T),
    Cs: String(Cs).trim(),
    sigma: parseFloat(sigma),
    t: parseFloat(t),
  });
}

// ─── B4 Model ───────────────────────────────────────────────────────────────
const B4_CEMENT = {
  R:  { τcem:0.016, εcem:360e-6, tauAu:1, epsAu:210e-6, rEpsA:-0.75, rEpsW:-3.5, rTauW:3, rAlpha:1, rT:-4.5, tauA:-0.33, tauW:-0.06, tauC:-0.1, epsA:-0.8, epsW:1.1, epsC:0.11, p1:0.70, p2:58.6e-3, p3:39.3e-3, p4:3.4e-3, p5:777e-6,  p5H:8.00, p2w:3.00, p3a:-1.10, p3w:0.40, p4a:-0.90, p4w:2.45, p5a:-1, p5w:0.78, p5e:-0.85 },
  RS: { τcem:0.08,  εcem:860e-6, tauAu:41, epsAu:-84e-6, rEpsA:-0.75, rEpsW:-3.5, rTauW:3, rAlpha:1.4, rT:-4.5, tauA:-0.33, tauW:-2.4, tauC:-2.7, epsA:-0.8, epsW:-0.27, epsC:0.11, p1:0.60, p2:17.4e-3, p3:39.3e-3, p4:3.4e-3, p5:94.6e-6, p5H:1.00, p2w:3.00, p3a:-1.10, p3w:0.40, p4a:-0.90, p4w:2.45, p5a:-1, p5w:0.78, p5e:-0.85 },
  SL: { τcem:0.01,  εcem:410e-6, tauAu:1, epsAu:0, rEpsA:-0.75, rEpsW:-3.5, rTauW:3, rAlpha:1, rT:-4.5, tauA:-0.33, tauW:3.55, tauC:3.8, epsA:-0.8, epsW:1.0, epsC:0.11, p1:0.80, p2:40.5e-3, p3:39.3e-3, p4:3.4e-3, p5:496e-6,  p5H:8.00, p2w:3.00, p3a:-1.10, p3w:0.40, p4a:-0.90, p4w:2.45, p5a:-1, p5w:0.78, p5e:-0.85 },
};
const B4_AGG = {
  Quartzite:    { ksτa:0.59,  ksεa:0.71 },
  Limestone:    { ksτa:1.80,  ksεa:0.95 },
  Sandstone:    { ksτa:2.30,  ksεa:1.60 },
  Granite:      { ksτa:4.00,  ksεa:1.05 },
  Diabase:      { ksτa:0.06,  ksεa:0.76 },
  'Quartz Diorite': { ksτa:15.0, ksεa:2.20 },
  'No Information': { ksτa:1.00, ksεa:1.00 },
};
const B4_SHAPE = { '1':{ks:1.00},'2':{ks:1.15},'3':{ks:1.25},'4':{ks:1.30},'5':{ks:1.55} };

/**
 * B4 compliance function J(t, t') in 1/GPa.
 * Also returns shrinkage strain εsh at time t.
 * @returns {{ J: number, epsilonSH: number }}
 */
export function b4Point({ t0, tPrime, T, h, fc, vS, c, wC, aC, cementType, aggregateType, specimenShape, t }) {
  const hDec   = h > 1 ? h / 100 : h;
  const cem    = B4_CEMENT[cementType || 'R'] || B4_CEMENT.R;
  const agg    = B4_AGG[aggregateType || 'Quartzite'] || B4_AGG.Quartzite;
  const shape  = B4_SHAPE[String(specimenShape) || '2'] || B4_SHAPE['2'];
  const tNum   = parseFloat(t), t0Num = parseFloat(t0), tpNum = parseFloat(tPrime);
  if (isNaN(tNum) || tNum < tpNum) return { J: NaN, epsilonSH: NaN };

  const D      = 2 * parseFloat(vS);
  const E28    = (4734 * Math.sqrt(parseFloat(fc))) / 1000;
  const bTh    = Math.exp(4000 * (1 / 293 - 1 / (parseFloat(T) + 273)));
  const t0T    = t0Num * bTh;
  const tpHat  = t0T + (tpNum - t0Num) * bTh;
  const tHat   = tpHat + (tNum - tpNum) * bTh;

  const tau0   = cem.τcem * Math.pow(parseFloat(aC)/6, cem.tauA) *
                 Math.pow(parseFloat(wC)/0.38, cem.tauW) *
                 Math.pow((6.5 * parseFloat(c)) / 2350, cem.tauC);
  const tauSH  = tau0 * agg.ksτa * Math.pow(shape.ks * D, 2);
  const eps0   = cem.εcem * Math.pow(parseFloat(aC)/6, cem.epsA) *
                 Math.pow(parseFloat(wC)/0.38, cem.epsW) *
                 Math.pow((6.5 * parseFloat(c)) / 2350, cem.epsC);
  const E1     = E28 * Math.sqrt((7*bTh + 600*bTh) / (4 + (6/7)*(7*bTh + 600*bTh)));
  const E2     = E28 * Math.sqrt((t0T + tauSH*bTh) / (4 + (6/7)*(t0T + tauSH*bTh)));
  const epsSHInf = -eps0 * agg.ksεa * (E1 / E2);
  const kh     = hDec <= 0.98 ? 1 - Math.pow(hDec, 3) : 12.94 * (1 - hDec) - 0.2;

  const q1  = cem.p1 / (E28 * 1000);
  const q2  = (cem.p2 * Math.pow(parseFloat(wC)/0.38, cem.p2w)) / 1000;
  const q3  = cem.p3 * q2 * Math.pow(parseFloat(aC)/6, cem.p3a) * Math.pow(parseFloat(wC)/0.38, cem.p3w);
  const q4  = (cem.p4 * Math.pow(parseFloat(aC)/6, cem.p4a) * Math.pow(parseFloat(wC)/0.38, cem.p4w)) / 1000;
  const rHat= 1.7 * Math.pow(tpHat, 0.12) + 8;
  const Z   = tHat > tpHat ? Math.pow(tpHat, -0.5) * Math.log(1 + Math.pow(tHat - tpHat, 0.1)) : 0.001;
  const Qf  = 1 / (0.086 * Math.pow(tpHat, 2/9) + 1.21 * Math.pow(tpHat, 4/9));
  const Q   = Qf * Math.pow(1 + Math.pow(Qf / Math.max(0.0001, Z), rHat), -1/rHat);
  const C0  = q2 * Q + q3 * Math.log(1 + Math.pow(Math.max(0, tHat - tpHat), 0.1)) +
              q4 * Math.log(Math.max(1, tHat / tpHat));
  const RT  = Math.exp(4000 * (1 / 293 - 1 / (parseFloat(T) + 273)));
  const q5  = (cem.p5 * Math.pow(parseFloat(aC)/6, cem.p5a) *
               Math.pow(parseFloat(wC)/0.38, cem.p5w) *
               Math.pow(Math.abs(kh * epsSHInf), cem.p5e)) / 1000;
  const H   = 1 - (1 - hDec) * Math.tanh(Math.sqrt(Math.max(0, tHat - t0T) / tauSH));
  const tp0 = Math.max(tpHat, t0T);
  const Hc  = 1 - (1 - hDec) * Math.tanh(Math.sqrt(Math.max(0, tp0 - t0T) / tauSH));
  const Cd  = tHat >= tp0 ? q5 * Math.sqrt(Math.max(0, Math.exp(-cem.p5H * H) - Math.exp(-cem.p5H * Hc))) : 0;
  const J   = q1 + RT * C0 + Cd;

  // Shrinkage strain at time t (measured from t0)
  const tTilde    = (tNum - t0Num) * bTh;
  const epsilonSH = epsSHInf * kh * Math.tanh(Math.sqrt(Math.max(0, tTilde) / tauSH));
  const epsilonAUInf = -cem.epsAu * Math.pow(parseFloat(aC)/6, cem.rEpsA) *
                       Math.pow(parseFloat(wC)/0.38, cem.rEpsW);
  const tauAU        = cem.tauAu * Math.pow(parseFloat(wC)/0.38, cem.rTauW);
  const alphaAU      = cem.rAlpha * (parseFloat(wC)/0.38);
  const epsilonAU    = epsilonAUInf *
                       Math.pow(1 + Math.pow(tauAU / (tTilde + t0T), alphaAU), cem.rT);

  return { J, epsilonSH, epsilonAU };
}

/** Single-row version for batch use. */
export function b4Single(row) {
  return b4Point(row);
}

// ─── B4S Model ──────────────────────────────────────────────────────────────
const B4S_CEMENT = {
  R:  { tau_au_cem:2.26, r_tau_f:0.27, eps_au_cem:78.2e-6, r_eps_f:1.03, tau_s_cem:0.027, s_tau_f:0.21,  eps_s_cem:590e-6, s_eps_f:-0.51, p1:0.70, p5e:-0.85, p5H:8,  s2:14.2e-3, s3:0.976, s4:4.00e-3, s5:1.54e-3,  s2f:-1.58, s3f:-1.61, s4f:-1.16, s5f:-0.45 },
  RS: { tau_au_cem:2.26, r_tau_f:0.27, eps_au_cem:78.2e-6, r_eps_f:1.03, tau_s_cem:0.027, s_tau_f:1.55,  eps_s_cem:830e-6, s_eps_f:-0.84, p1:0.60, p5e:-0.85, p5H:1,  s2:29.9e-3, s3:0.976, s4:4.00e-3, s5:41.8e-3,  s2f:-1.58, s3f:-1.61, s4f:-1.16, s5f:-0.45 },
  SL: { tau_au_cem:2.26, r_tau_f:0.27, eps_au_cem:78.2e-6, r_eps_f:1.03, tau_s_cem:0.032, s_tau_f:-1.84, eps_s_cem:640e-6, s_eps_f:-0.69, p1:0.80, p5e:-0.85, p5H:8,  s2:11.2e-3, s3:0.976, s4:4.00e-3, s5:150e-3,   s2f:-1.58, s3f:-1.61, s4f:-1.16, s5f:-0.45 },
};
const B4S_AGG = {
  Quartzite:       { ksτa:0.59,  ksεa:0.71 },
  Limestone:       { ksτa:1.80,  ksεa:0.95 },
  Sandstone:       { ksτa:2.30,  ksεa:1.60 },
  Granite:         { ksτa:4.00,  ksεa:1.05 },
  Diabase:         { ksτa:0.06,  ksεa:0.76 },
  'Quartz Diorite':{ ksτa:15.0,  ksεa:2.20 },
  'No Information':{ ksτa:1.00,  ksεa:1.00 },
};

/**
 * B4S compliance function J(t, t') in 1/GPa + shrinkage εsh.
 * Simplified variant — uses only fc (no mix design).
 * @returns {{ J: number, epsilonSH: number }}
 */
export function b4sPoint({ t0, tPrime, T, h, fc, vS, cementType, aggregateType, specimenShape, t }) {
  const hDec   = parseFloat(h) > 1 ? parseFloat(h) / 100 : parseFloat(h);
  const cem    = B4S_CEMENT[cementType || 'R'] || B4S_CEMENT.R;
  const agg    = B4S_AGG[aggregateType || 'Quartzite'] || B4S_AGG.Quartzite;
  const shape  = B4_SHAPE[String(specimenShape) || '2'] || B4_SHAPE['2'];
  const tNum   = parseFloat(t), t0Num = parseFloat(t0), tpNum = parseFloat(tPrime);
  const fcNum  = parseFloat(fc), vSNum = parseFloat(vS), TNum = parseFloat(T);
  if (isNaN(tNum) || tNum < tpNum) return { J: NaN, epsilonSH: NaN };

  const D      = 2 * vSNum;
  const E28    = (4734 * Math.sqrt(fcNum)) / 1000;
  const bTh    = Math.exp(4000 * (1 / 293 - 1 / (TNum + 273)));
  const t0T    = t0Num * bTh;
  const tpHat  = t0T + (tpNum - t0Num) * bTh;
  const tHat   = tpHat + (tNum - tpNum) * bTh;

  const tau0   = cem.tau_s_cem * Math.pow(fcNum / 40, cem.s_tau_f);
  const tauSH  = tau0 * agg.ksτa * Math.pow(shape.ks * D, 2);
  const eps0   = cem.eps_s_cem * Math.pow(fcNum / 40, cem.s_eps_f);
  const E1     = E28 * Math.sqrt((7*bTh + 600*bTh) / (4 + (6/7)*(7*bTh + 600*bTh)));
  const E2     = E28 * Math.sqrt((t0T + tauSH*bTh) / (4 + (6/7)*(t0T + tauSH*bTh)));
  const epsSHInf = -eps0 * agg.ksεa * (E1 / E2);
  const kh     = hDec <= 0.98 ? 1 - Math.pow(hDec, 3) : 12.94 * (1 - hDec) - 0.2;

  const q1  = cem.p1 / (E28 * 1000);
  const q2  = cem.s2 * Math.pow(fcNum / 40, cem.s2f) / 1000;
  const q3  = cem.s3 * q2 * Math.pow(fcNum / 40, cem.s3f);
  const q4  = cem.s4 * Math.pow(fcNum / 40, cem.s4f) / 1000;
  const rHat= 1.7 * Math.pow(tpHat, 0.12) + 8;
  const Z   = tHat > tpHat ? Math.pow(tpHat, -0.5) * Math.log(1 + Math.pow(tHat - tpHat, 0.1)) : 0.001;
  const Qf  = 1 / (0.086 * Math.pow(tpHat, 2/9) + 1.21 * Math.pow(tpHat, 4/9));
  const Q   = Qf * Math.pow(1 + Math.pow(Qf / Math.max(0.0001, Z), rHat), -1/rHat);
  const C0  = q2 * Q + q3 * Math.log(1 + Math.pow(Math.max(0, tHat - tpHat), 0.1)) +
              q4 * Math.log(Math.max(1, tHat / tpHat));
  const RT  = Math.exp(4000 * (1 / 293 - 1 / (TNum + 273)));
  const q5  = cem.s5 * Math.pow(fcNum / 40, cem.s5f) *
              Math.pow(Math.abs(kh * epsSHInf), cem.p5e) / 1000;
  const H   = 1 - (1 - hDec) * Math.tanh(Math.sqrt(Math.max(0, tHat - t0T) / tauSH));
  const tp0 = Math.max(tpHat, t0T);
  const Hc  = 1 - (1 - hDec) * Math.tanh(Math.sqrt(Math.max(0, tp0 - t0T) / tauSH));
  const Cd  = tHat >= tp0 ? q5 * Math.sqrt(Math.max(0, Math.exp(-cem.p5H * H) - Math.exp(-cem.p5H * Hc))) : 0;
  const J   = q1 + RT * C0 + Cd;

  const tTilde    = (tNum - t0Num) * bTh;
  const epsilonSH = epsSHInf * kh * Math.tanh(Math.sqrt(Math.max(0, tTilde) / tauSH));
  const epsilonAUInf = -cem.eps_au_cem * Math.pow(fcNum / 40, cem.r_eps_f);
  const tauAU        = cem.tau_au_cem * Math.pow(fcNum / 40, cem.r_tau_f);
  const epsilonAU    = epsilonAUInf *
                       Math.pow(1 + Math.pow(tauAU / (tTilde + t0T), 1.73), -1.73);

  return { J, epsilonSH, epsilonAU };
}

/** Single-row version for batch use. */
export function b4sSingle(row) {
  return b4sPoint(row);
}
