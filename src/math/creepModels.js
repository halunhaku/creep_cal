/**
 * CREEP_LAB — Shared Math Kernels
 * Single source of truth for all JS creep/shrinkage computations.
 * Used by: BatchCalculator, individual JS calculators, and any future tools.
 */

/**
 * Length of the concrete-age series every calculator produces (0…10,000 days).
 * Shared so the run, the comparison label and the axis domain cannot drift.
 */
export const MAX_SERIES_DAYS = 10000;

// Shared range guard used by every kernel's validation.
const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

/**
 * Strict coercion for the batch row adapters.
 *
 * The four adapters disagreed about what a spreadsheet cell means: ACI and
 * MC2010 used `parseFloat` (`'1,200'` -> 1, `'38,5'` -> 38, `'365 days'` -> 365)
 * while B4 and B4s used `Number` (`''` -> 0, `' '` -> 0, `true` -> 1,
 * `'0x10'` -> 16). Either way a cell the user can see was read as a different
 * number — often as an extreme end of the model's range — and the row was
 * reported valid, so a blank humidity cell became 0 % RH and a thousands
 * separator turned 1,200 days into 1 day.
 *
 * Accept a number, or a string that is *only* a number. Everything else
 * (blank, whitespace, booleans, null, unit suffixes, percent signs, thousands
 * separators, decimal commas, hex) becomes NaN, which every kernel's range
 * validation already rejects with a message naming the field.
 *
 * @param {unknown} value
 * @returns {number} the value, or NaN when the cell is not a single number
 */
export function coerceNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const text = value.trim();
  if (text === '' || !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text)) return NaN;
  return Number(text);
}

// ─── ACI 209R-92 ────────────────────────────────────────────────────────────
/**
 * ACI 209R-92 correction factors are only defined over the calibration domain
 * below. Without these checks an out-of-domain row silently produces nonsense —
 * e.g. H = 500 % returns a *negative* creep coefficient — and the batch pipeline
 * reports the row as valid. The other three kernels already validate.
 */
function validateAci209({ curingType, t0, H, VS, slump, fineAggregate, airContent, t }) {
  if (curingType !== 'moist' && curingType !== 'steam') {
    throw new RangeError(`Unsupported ACI 209R-92 curing type: ${curingType}`);
  }
  if (!Number.isFinite(t0) || t0 < 1) {
    throw new RangeError('ACI 209R-92 requires t0 ≥ 1 day.');
  }
  if (!Number.isFinite(t) || t < 0) {
    throw new RangeError('ACI 209R-92 requires a non-negative finite concrete age t.');
  }
  if (!inRange(H, 0, 100)) {
    throw new RangeError('ACI 209R-92 requires 0 ≤ H ≤ 100%.');
  }
  if (!Number.isFinite(VS) || VS <= 0) {
    throw new RangeError('ACI 209R-92 requires a positive volume-surface ratio V/S.');
  }
  if (!Number.isFinite(slump) || slump < 0) {
    throw new RangeError('ACI 209R-92 requires a non-negative slump.');
  }
  if (!inRange(fineAggregate, 0, 100)) {
    throw new RangeError('ACI 209R-92 requires 0 ≤ fine aggregate ≤ 100%.');
  }
  if (!Number.isFinite(airContent) || airContent < 0) {
    throw new RangeError('ACI 209R-92 requires a non-negative air content.');
  }
}

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
  validateAci209({ curingType, t0, H, VS, slump, fineAggregate, airContent, t });
  const dt = t - t0;
  if (dt <= 0) return 0;

  const loadingAgeFactor = curingType === 'moist'
    ? (t0 <= 7 ? 1 : 1.25 * Math.pow(t0, -0.118))
    : (t0 <= 3 ? 1 : 1.13 * Math.pow(t0, -0.094));

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
    t0: coerceNumber(t0),
    H: coerceNumber(H),
    VS: coerceNumber(VS),
    slump: coerceNumber(slump),
    fineAggregate: coerceNumber(fineAggregate),
    airContent: coerceNumber(airContent),
    t: coerceNumber(t),
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

  /*
   * φ_dc divides by (0.1·h₀/100)^{1/3}, so a notional size that underflows to
   * zero returns Infinity instead of throwing — reachable through this public
   * API (Ac = 1e-300, u = 1e300) even though the workspace's own fields cannot
   * express it. The Rust kernel carries the same gap; it needs the same bound at
   * the next wasm rebuild.
   */
  const notionalSize = (2 * Ac) / u;
  if (!Number.isFinite(notionalSize) || notionalSize <= 0) {
    throw new RangeError('MC2010 requires a finite notional size 2Ac/u greater than zero.');
  }

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
    fcm: coerceNumber(fcm),
    RH: coerceNumber(RH),
    t0: coerceNumber(t0),
    Ac: coerceNumber(Ac),
    u: coerceNumber(u),
    T: coerceNumber(T),
    Cs: String(Cs).trim(),
    sigma: coerceNumber(sigma),
    t: coerceNumber(t),
  });
}

// ─── RILEM Model B4 / B4s ──────────────────────────────────────────────────
/*
 * The `RS` row's negative `epsilonAuCem` is the published value, not a
 * transcription slip: the B4 cement-type table gives ε_au,cem = 210 × 10⁻⁶ (R),
 * −84 × 10⁻⁶ (RS), 0 (SL), and the model's own autogenous formula carries a
 * leading minus — ε_au∞ = −ε_au,cem (a/c/6)^{r_εa} (w/c/0.38)^{r_εw}. Rapid-
 * hardening cement therefore gets a *positive* (expansive) autogenous term by
 * construction: measured +0.076 µε at t = 112 d and +15.06 µε at t = 3650 d on
 * the paper's §1.9 case, and SL gets exactly zero. B4s is a different fit with a
 * single ε_au,cem = 78.2 × 10⁻⁶ for every cement type, so it stays contractive —
 * the two models disagree in sign for RS concrete by design, not by bug.
 *
 * Checked against the published tables, from two independent sources that both
 * reproduce the RILEM recommendation (Sakthivel, IIT Madras, Tables 2.1–2.6, and
 * the TC-242-MDC reference script by K. Zdanowicz, whose table comments name the
 * paper's Table 1/2/3/6): every cement, aggregate, shape and admixture
 * coefficient below matches, as does the shrinkage table (τ_cem 0.016/0.08/0.01,
 * ε_cem 360/860/410 × 10⁻⁶, …) and the humidity factor's 0.98 switch. One
 * difference worth knowing: that script evaluates the autogenous term at
 * (t̃ − t̃₀) where the recommendation — and this kernel — use (t̃ + t̃₀); the
 * §1.9 benchmark below only reproduces with the plus sign.
 */
export const B4_CEMENT = {
  R:  { tauCem:0.016, epsilonCem:360e-6, tauAuCem:1,  epsilonAuCem:210e-6, rEpsA:-0.75, rEpsW:-3.5, rTauW:3, rAlpha:1,   rT:-4.5, tauA:-0.33, tauW:-0.06, tauC:-0.1, epsA:-0.8, epsW:1.1,   epsC:0.11, p1:0.70, p2:58.6e-3, p3:39.3e-3, p4:3.4e-3, p5:777e-6,  p5H:8, p2w:3, p3a:-1.1, p3w:0.4, p4a:-0.9, p4w:2.45, p5a:-1, p5w:0.78, p5e:-0.85 },
  RS: { tauCem:0.08,  epsilonCem:860e-6, tauAuCem:41, epsilonAuCem:-84e-6, rEpsA:-0.75, rEpsW:-3.5, rTauW:3, rAlpha:1.4, rT:-4.5, tauA:-0.33, tauW:-2.4,  tauC:-2.7, epsA:-0.8, epsW:-0.27, epsC:0.11, p1:0.60, p2:17.4e-3, p3:39.3e-3, p4:3.4e-3, p5:94.6e-6, p5H:1, p2w:3, p3a:-1.1, p3w:0.4, p4a:-0.9, p4w:2.45, p5a:-1, p5w:0.78, p5e:-0.85 },
  SL: { tauCem:0.01,  epsilonCem:410e-6, tauAuCem:1,  epsilonAuCem:0,      rEpsA:-0.75, rEpsW:-3.5, rTauW:3, rAlpha:1,   rT:-4.5, tauA:-0.33, tauW:3.55,  tauC:3.8,  epsA:-0.8, epsW:1,     epsC:0.11, p1:0.80, p2:40.5e-3, p3:39.3e-3, p4:3.4e-3, p5:496e-6,  p5H:8, p2w:3, p3a:-1.1, p3w:0.4, p4a:-0.9, p4w:2.45, p5a:-1, p5w:0.78, p5e:-0.85 },
};

const B4S_CEMENT = {
  R:  { tauAuCem:2.26, rTauF:0.27, epsilonAuCem:78.2e-6, rEpsF:1.03, alpha:1.73, rT:-1.73, tauSCem:0.027, sTauF:0.21,  epsilonSCem:590e-6, sEpsF:-0.51, p1:0.70, p5e:-0.85, p5H:8, s2:14.2e-3, s3:0.976, s4:4e-3, s5:1.54e-3, s2f:-1.58, s3f:-1.61, s4f:-1.16, s5f:-0.45 },
  RS: { tauAuCem:2.26, rTauF:0.27, epsilonAuCem:78.2e-6, rEpsF:1.03, alpha:1.73, rT:-1.73, tauSCem:0.027, sTauF:1.55,  epsilonSCem:830e-6, sEpsF:-0.84, p1:0.60, p5e:-0.85, p5H:1, s2:29.9e-3, s3:0.976, s4:4e-3, s5:41.8e-6, s2f:-1.58, s3f:-1.61, s4f:-1.16, s5f:-0.45 },
  SL: { tauAuCem:2.26, rTauF:0.27, epsilonAuCem:78.2e-6, rEpsF:1.03, alpha:1.73, rT:-1.73, tauSCem:0.032, sTauF:-1.84, epsilonSCem:640e-6, sEpsF:-0.69, p1:0.80, p5e:-0.85, p5H:8, s2:11.2e-3, s3:0.976, s4:4e-3, s5:150e-6,  s2f:-1.58, s3f:-1.61, s4f:-1.16, s5f:-0.45 },
};

export const B4_AGGREGATE = {
  Diabase: { tau:0.06, epsilon:0.76 },
  Quartzite: { tau:0.59, epsilon:0.71 },
  Limestone: { tau:1.8, epsilon:0.95 },
  Sandstone: { tau:2.3, epsilon:1.6 },
  Granite: { tau:4, epsilon:1.05 },
  'Quartz Diorite': { tau:15, epsilon:2.2 },
  'No Information': { tau:1, epsilon:1 },
};
const B4_SHAPE = { '1':1, '2':1.15, '3':1.25, '4':1.3, '5':1.55 };

/**
 * B4 temperature acceleration β_T = exp[U_h/R · (1/293 − 1/(T+273))], U_h/R = 4000 K.
 *
 * Exported because the workspace has to undo it: J = q₁ + β(Tc)·C₀ + C_d, so
 * reading the instantaneous compliance q₁ back out of a result means dividing
 * C₀ by the same factor this produced (see B4Calculator).
 */
export function b4TemperatureAcceleration(temperature) {
  return Math.exp(4000 * (1 / 293 - 1 / (temperature + 273)));
}

/**
 * B4 humidity is always a percentage (0–100) — earlier revisions also accepted a
 * 0–1 fraction, which made `h = 1` mean 100 % RH while the UI labels the field
 * "%", silently returning a wrong result for anyone typing 1–99.
 *
 * The accepted range stops at 98.4 %: B4 Eq. (21) uses `12.94(1 − h) − 0.2` above
 * h = 98 %, which reaches zero at 98.4544 %, and `q₅ ∝ |k_h·ε_sh∞|^{p5ε}` is
 * singular there (p5ε ≈ −0.85). Between 98.4 % and that zero the drying-creep
 * term is amplified by orders of magnitude — measured Cd rises from 50 µε at
 * 98 % to 2.8 × 10⁵ µε at 98.4544 % — so the model is not usable in that band.
 */
function normalizeB4Humidity(value) {
  const percent = coerceNumber(value);
  if (!inRange(percent, 0, 98.4)) {
    throw new RangeError('B4 requires relative humidity between 0 and 100% (the drying formulation is only usable up to 98.4%).');
  }
  return percent / 100;
}

/**
 * B4 Eq. (21) humidity factor, clamped at zero. Within the validated range
 * (h ≤ 98.4 %) the value is already positive; the clamp only protects direct
 * kernel calls that bypass validation.
 */
function b4HumidityFactor(humidity) {
  if (humidity <= 0.98) return 1 - humidity ** 3;
  return Math.max(0, 12.94 * (1 - humidity) - 0.2);
}

/**
 * `q₅ ∝ |k_h·ε_sh∞|^{p5ε}` uses the *negative* exponent p5ε ≈ −0.85, so it is
 * singular when the humidity factor vanishes. Flooring the base keeps the
 * drying-creep term finite; it is multiplied by a vanishing
 * `e^{−p5H·H} − e^{−p5H·Hc}` term, so a saturated section still yields Cd = 0.
 * Unreachable through `b4Point`/`b4sPoint` after the 98.4 % cap.
 */
function b4DryingCreepScale(humidityFactor, shrinkageInfinity) {
  return Math.max(Math.abs(humidityFactor * shrinkageInfinity), 1e-9);
}

function validateB4Common({ t0, tPrime, Tcur, Tsh, Tc, h, fc, vS, cementType, aggregateType, specimenShape, t }) {
  if (!Number.isFinite(t0) || t0 < 1 || !Number.isFinite(tPrime) || tPrime < 1) {
    throw new RangeError('B4 is not intended for concrete younger than 1 day.');
  }
  if (!Number.isFinite(t) || t < 0) throw new RangeError('B4 requires a non-negative concrete age t.');
  if (!inRange(fc, 15, 70)) throw new RangeError('B4 calibration range is 15 ≤ fc ≤ 70 MPa.');
  if (!inRange(vS, 12, 120)) throw new RangeError('B4 calibration range is 12 ≤ V/S ≤ 120 mm.');
  if (!inRange(Tcur, 20, 30)) throw new RangeError('B4 curing-temperature range is 20 ≤ Tcur ≤ 30°C.');
  if (!inRange(Tsh, -25, 75) || !inRange(Tc, -25, 75)) {
    throw new RangeError('B4 environmental-temperature range is -25 ≤ T ≤ 75°C.');
  }
  normalizeB4Humidity(h);
  if (!(cementType in B4_CEMENT)) throw new RangeError(`Unsupported B4 cement type: ${cementType}`);
  if (!(aggregateType in B4_AGGREGATE)) throw new RangeError(`Unsupported B4 aggregate type: ${aggregateType}`);
  if (!(String(specimenShape) in B4_SHAPE)) throw new RangeError(`Unsupported B4 specimen shape: ${specimenShape}`);
}

function b4TimeState({ t0, tPrime, Tcur, Tsh, Tc, t }) {
  const betaTh = b4TemperatureAcceleration(Tcur);
  const betaTs = b4TemperatureAcceleration(Tsh);
  const betaTc = b4TemperatureAcceleration(Tc);
  const t0Tilde = t0 * betaTh;
  const tPrimeHat = tPrime >= t0
    ? t0Tilde + (tPrime - t0) * betaTs
    : tPrime * betaTh;
  const tHat = t >= tPrime
    ? tPrimeHat + (t - tPrime) * betaTc
    : (t >= t0 ? t0Tilde + (t - t0) * betaTs : t * betaTh);
  const dryingDuration = Math.max(0, t - t0) * betaTs;
  const equivalentAge = t >= t0 ? t0Tilde + dryingDuration : t * betaTh;
  return { betaTh, betaTs, betaTc, t0Tilde, tPrimeHat, tHat, dryingDuration, equivalentAge };
}

function b4CreepTimeTerms(tPrimeHat, tHat) {
  const elapsed = Math.max(0, tHat - tPrimeHat);
  if (elapsed === 0) return { Q:0, logElapsed:0, logAge:0 };
  const r = 1.7 * Math.pow(tPrimeHat, 0.12) + 8;
  const Z = Math.pow(tPrimeHat, -0.5) * Math.log(1 + Math.pow(elapsed, 0.1));
  const Qf = 1 / (0.086 * Math.pow(tPrimeHat, 2 / 9) + 1.21 * Math.pow(tPrimeHat, 4 / 9));
  const Q = Qf * Math.pow(1 + Math.pow(Qf / Z, r), -1 / r);
  return { Q, logElapsed:Math.log(1 + Math.pow(elapsed, 0.1)), logAge:Math.log(tHat / tPrimeHat) };
}

function b4AdmixtureFactors({ retarder=0, flyAsh=0, superplasticizer=0, silicaFume=0, airEntrainingAgent=0, waterReducer=0 }) {
  const re = coerceNumber(retarder), fly = coerceNumber(flyAsh), superValue = coerceNumber(superplasticizer);
  const silica = coerceNumber(silicaFume), aea = coerceNumber(airEntrainingAgent), wr = coerceNumber(waterReducer);
  for (const [name, value] of Object.entries({ retarder:re, flyAsh:fly, superplasticizer:superValue, silicaFume:silica, airEntrainingAgent:aea, waterReducer:wr })) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`B4 admixture percentage ${name} must be a non-negative number.`);
  }

  let shrinkage = [1, 1, 1, 1];
  if (re > 0) {
    if (re <= 0.5 && fly < 15) shrinkage = [6, 0.58, 0.5, 2.6];
    else if (re <= 0.6 && fly <= 15) shrinkage = [2, 0.43, 0.59, 3.1];
    else if (re <= 0.6 && fly <= 30) shrinkage = [2.1, 0.72, 0.88, 3.4];
    else if (re <= 0.6) shrinkage = [2.8, 0.87, 1.6, 5];
    else if (fly <= 15) shrinkage = [2, 0.26, 0.22, 0.95];
    else if (fly <= 30) shrinkage = [2.1, 1.1, 1.1, 3.3];
    else shrinkage = [2.1, 1.1, 0.97, 4];
  } else if (fly > 0) {
    if (fly <= 15 && superValue <= 5) shrinkage = [0.32, 0.71, 0.55, 1.71];
    else if (fly <= 15) shrinkage = [0.32, 0.55, 0.92, 2.3];
    else if (fly <= 30 && superValue <= 5) shrinkage = [0.5, 0.9, 0.82, 1.25];
    else if (fly <= 30) shrinkage = [0.5, 0.8, 0.8, 2.81];
    else if (superValue <= 5) shrinkage = [0.63, 1.38, 0, 1.2];
    else shrinkage = [0.63, 0.95, 0.76, 3.11];
  } else if (superValue > 0) {
    if (superValue <= 5 && silica <= 8) shrinkage = [6, 2.8, 0.29, 0.21];
    else if (superValue <= 5) shrinkage = [3, 0.96, 0.26, 0.71];
    else if (silica <= 8) shrinkage = [8, 1.95, 0, 1];
    else if (silica <= 18) shrinkage = [2.6, 0.82, 0, 1.2];
    else shrinkage = [1, 1.5, 5, 1];
  } else if (silica > 0) {
    if (silica <= 8) shrinkage = [1.9, 0.47, 0, 1.2];
    else if (silica <= 18) shrinkage = [2.6, 0.82, 0, 1.2];
    else shrinkage = [1, 1.5, 5, 1];
  } else if (aea > 0) {
    shrinkage = aea <= 0.05 ? [2.3, 1.1, 0.28, 0.35] : [0.44, 4.28, 0, 0.36];
  } else if (wr > 0) {
    shrinkage = wr <= 2 ? [0.5, 0.38, 0, 1.9] : (wr <= 3 ? [6, 0.45, 1.51, 0.3] : [2.4, 0.4, 0.68, 1.4]);
  }

  let creep = [1, 1, 1, 1];
  if (re > 0) creep = re <= 0.5 && fly < 15 ? [0.31, 7.14, 1.35, 0.48] : [1.43, 0.58, 0.9, 0.46];
  else if (fly > 0) creep = fly >= 15 ? [0.37, 2.33, 0.63, 1.6] : [0.31, 7.14, 1.35, 0.48];
  else if (superValue > 0) creep = [0.72, 2.19, 1.72, 0.48];
  else if (silica > 0) creep = [1.12, 3.11, 0.51, 0.61];
  else if (aea > 0) creep = [0.9, 3.17, 1, 0.1];
  else if (wr > 0) creep = wr <= 2 ? [1, 2.1, 1.68, 0.45] : (wr <= 3 ? [1.41, 0.72, 1.76, 0.6] : [1.28, 2.58, 0.73, 1.1]);

  return { tauCem:shrinkage[0], epsilonAuCem:shrinkage[1], rEpsW:shrinkage[2], rAlpha:shrinkage[3], p2:creep[0], p3:creep[1], p4:creep[2], p5:creep[3] };
}

function b4Result({ common, epsilonSHInf, tauSH, epsilonAUInf, tauAU, alphaAU, rT, q1, q2, q3, q4, q5, p5H }) {
  // Raw t0 is consumed by b4TimeState when `time` is built; the expressions
  // below read the equivalent time time.t0Tilde instead.
  const { t, tPrime, h, time } = common;
  const humidity = normalizeB4Humidity(h);
  const kh = b4HumidityFactor(humidity);
  const shrinkageDevelopment = Math.tanh(Math.sqrt(time.dryingDuration / tauSH));
  const epsilonSH = epsilonSHInf * kh * shrinkageDevelopment;
  const epsilonAU = time.equivalentAge > 0
    ? epsilonAUInf * Math.pow(1 + Math.pow(tauAU / time.equivalentAge, alphaAU), rT)
    : 0;

  let C0 = 0, Cd = 0, J = 0;
  if (t >= tPrime) {
    const terms = b4CreepTimeTerms(time.tPrimeHat, time.tHat);
    C0 = q2 * terms.Q + q3 * terms.logElapsed + q4 * terms.logAge;
    const start = Math.max(time.tPrimeHat, time.t0Tilde);
    if (time.tHat >= start) {
      const H = 1 - (1 - humidity) * Math.tanh(Math.sqrt(Math.max(0, time.tHat - time.t0Tilde) / tauSH));
      const Hc = 1 - (1 - humidity) * Math.tanh(Math.sqrt(Math.max(0, start - time.t0Tilde) / tauSH));
      Cd = q5 * Math.sqrt(Math.max(0, Math.exp(-p5H * H) - Math.exp(-p5H * Hc)));
    }
    J = q1 + time.betaTc * C0 + Cd;
  }

  return { t, J, J_GPa:J * 1000, C0, Cd, epsilonSH, epsilonAU, epsilonTotal:epsilonSH + epsilonAU };
}

/** RILEM Model B4 composition-based mean prediction. J is returned in 1/MPa. */
export function b4Point(input) {
  const numericKeys = ['t0','tPrime','Tcur','Tsh','Tc','h','fc','vS','c','wC','aC','t'];
  const params = { ...input };
  for (const key of numericKeys) params[key] = coerceNumber(params[key]);
  validateB4Common(params);
  if (!inRange(params.c, 200, 1500)) throw new RangeError('B4 calibration range is 200 ≤ c ≤ 1500 kg/m³.');
  if (!inRange(params.wC, 0.22, 0.87)) throw new RangeError('B4 calibration range is 0.22 ≤ w/c ≤ 0.87.');
  if (!inRange(params.aC, 1, 13.2)) throw new RangeError('B4 calibration range is 1 ≤ a/c ≤ 13.2.');

  const cement = B4_CEMENT[params.cementType];
  const aggregate = B4_AGGREGATE[params.aggregateType];
  const shape = B4_SHAPE[String(params.specimenShape)];
  const admixture = b4AdmixtureFactors(params);
  const time = b4TimeState(params);
  const D = 2 * params.vS;
  const tau0 = cement.tauCem * admixture.tauCem * Math.pow(params.aC / 6, cement.tauA)
    * Math.pow(params.wC / 0.38, cement.tauW) * Math.pow(6.5 * params.c / 2350, cement.tauC);
  const tauSH = tau0 * aggregate.tau * Math.pow(shape * D, 2);
  const epsilon0 = cement.epsilonCem * Math.pow(params.aC / 6, cement.epsA)
    * Math.pow(params.wC / 0.38, cement.epsW) * Math.pow(6.5 * params.c / 2350, cement.epsC);
  const E28 = 4734 * Math.sqrt(params.fc) / 1000;
  const E1Age = 7 * time.betaTh + 600 * time.betaTs;
  const E2Age = time.t0Tilde + tauSH * time.betaTs;
  const E1 = E28 * Math.sqrt(E1Age / (4 + (6 / 7) * E1Age));
  const E2 = E28 * Math.sqrt(E2Age / (4 + (6 / 7) * E2Age));
  const epsilonSHInf = -epsilon0 * aggregate.epsilon * E1 / E2;
  const humidity = normalizeB4Humidity(params.h);
  const kh = b4HumidityFactor(humidity);
  const q1 = cement.p1 / (E28 * 1000);
  const q2 = cement.p2 * admixture.p2 * Math.pow(params.wC / 0.38, cement.p2w) / 1000;
  const q3 = cement.p3 * admixture.p3 * q2 * Math.pow(params.aC / 6, cement.p3a) * Math.pow(params.wC / 0.38, cement.p3w);
  const q4 = cement.p4 * admixture.p4 * Math.pow(params.aC / 6, cement.p4a) * Math.pow(params.wC / 0.38, cement.p4w) / 1000;
  const q5 = cement.p5 * admixture.p5 * Math.pow(params.aC / 6, cement.p5a)
    * Math.pow(params.wC / 0.38, cement.p5w) * Math.pow(b4DryingCreepScale(kh, epsilonSHInf), cement.p5e) / 1000;
  const epsilonAUInf = -cement.epsilonAuCem * admixture.epsilonAuCem * Math.pow(params.aC / 6, cement.rEpsA)
    * Math.pow(params.wC / 0.38, cement.rEpsW * admixture.rEpsW);
  const tauAU = cement.tauAuCem * Math.pow(params.wC / 0.38, cement.rTauW);
  const alphaAU = cement.rAlpha * admixture.rAlpha * params.wC / 0.38;
  return b4Result({
    common:{ ...params, time }, epsilonSHInf, tauSH, epsilonAUInf, tauAU, alphaAU,
    rT:cement.rT, q1, q2, q3, q4, q5, p5H:cement.p5H,
  });
}

/** RILEM Model B4s strength-based mean prediction. J is returned in 1/MPa. */
export function b4sPoint(input) {
  const numericKeys = ['t0','tPrime','Tcur','Tsh','Tc','h','fc','vS','t'];
  const params = { ...input };
  for (const key of numericKeys) params[key] = coerceNumber(params[key]);
  validateB4Common(params);
  const cement = B4S_CEMENT[params.cementType];
  const aggregate = B4_AGGREGATE[params.aggregateType];
  const shape = B4_SHAPE[String(params.specimenShape)];
  const time = b4TimeState(params);
  const D = 2 * params.vS;
  const strength = params.fc / 40;
  const tau0 = cement.tauSCem * Math.pow(strength, cement.sTauF);
  const tauSH = tau0 * aggregate.tau * Math.pow(shape * D, 2);
  const epsilon0 = cement.epsilonSCem * Math.pow(strength, cement.sEpsF);
  const E28 = 4734 * Math.sqrt(params.fc) / 1000;
  const E1Age = 7 * time.betaTh + 600 * time.betaTs;
  const E2Age = time.t0Tilde + tauSH * time.betaTs;
  const E1 = E28 * Math.sqrt(E1Age / (4 + (6 / 7) * E1Age));
  const E2 = E28 * Math.sqrt(E2Age / (4 + (6 / 7) * E2Age));
  const epsilonSHInf = -epsilon0 * aggregate.epsilon * E1 / E2;
  const humidity = normalizeB4Humidity(params.h);
  const kh = b4HumidityFactor(humidity);
  const q1 = cement.p1 / (E28 * 1000);
  const q2 = cement.s2 * Math.pow(strength, cement.s2f) / 1000;
  const q3 = cement.s3 * q2 * Math.pow(strength, cement.s3f);
  const q4 = cement.s4 * Math.pow(strength, cement.s4f) / 1000;
  const q5 = cement.s5 * Math.pow(strength, cement.s5f) * Math.pow(b4DryingCreepScale(kh, epsilonSHInf), cement.p5e) / 1000;
  const epsilonAUInf = -cement.epsilonAuCem * Math.pow(strength, cement.rEpsF);
  const tauAU = cement.tauAuCem * Math.pow(strength, cement.rTauF);
  return b4Result({
    common:{ ...params, time }, epsilonSHInf, tauSH, epsilonAUInf, tauAU, alphaAU:cement.alpha,
    rT:cement.rT, q1, q2, q3, q4, q5, p5H:cement.p5H,
  });
}

export function b4Single(row) { return b4Point(row); }
export function b4sSingle(row) { return b4sPoint(row); }

// ─── GL2000, Gardner & Lockman 2001 ─────────────────────────────────────────
/**
 * GL2000 drying-shrinkage and creep prediction, SI units throughout
 * (MPa, mm, days; V/S in mm, h in %). Equations follow Gardner's own
 * appendix (CJCE comparison paper [A1]–[A6]), cross-checked against ACI
 * 209.2R-08 Appendix A and Auburn ALDOT 930989 §3.2.8:
 * shrinkage εsh = εshu·β(h)·β(t) with εshu = 900·K·√(30/fcm28) µe,
 * β(h) = 1−1.18·h⁴, β(t) = √((t−tc)/((t−tc)+0.12·(V/S)²));
 * compliance J = 1/Ecmto + φ28/Ecm28 with φ28 = Φ(tc)·[basic + drying],
 * basic = 2(t−to)^0.3/((t−to)^0.3+14)·(7/to)^0.5·((t−to)/((t−to)+7))^0.5,
 * drying = 2.5(1−1.086h²)·((t−to)/((t−to)+0.12(V/S)²))^0.5,
 * Φ(tc) = 1 for to = tc, else 1−√((to−tc)/((to−tc)+0.15(V/S)²));
 * E = 3500+4300√f, f_cmt = fcm28·exp{s[1−√(28/t)]}.
 *
 * Deliberate choices, all documented in docs/benchmark-sources.md:
 *  - Type-II K = 0.75 per Gardner and Table A.14; Auburn Eq 3.189 prints
 *    0.70 and is the odd one out. Type-II s = 0.40 likewise.
 *  - Auburn's drying-size 97 (inches) converts to 0.150/mm², not Gardner's
 *    0.12 — their transcription, not the model; the shrinkage half
 *    independently confirms 0.12 in mm.
 *  - The guide's C.4 creep table is not a validation target: its sub-terms
 *    match Gardner's exactly but are added instead of multiplied, the drying
 *    part is missing, and Φ/βs contradict the example's own inputs.
 *  - Like B4/B4s, shrinkage is NEGATIVE microstrain (shortening); the
 *    literature prints magnitudes. epsilonAU is an explicit 0 — the model
 *    has no autogenous term — so the result keeps the B4 result shape.
 *  - Near-100 % RH the shrinkage formula itself approaches zero and then
 *    negative (sealed concrete is assigned 96 % RH in the literature for
 *    this reason); the kernel returns what the equations say, and the
 *    drying-creep term is zero by design at 96 %.
 *  - Loading before drying started (t0 < tc) is outside the model as
 *    published (Φ needs a non-negative gap) and is rejected, not fudged.
 */
// s drives strength development ([A3]); K scales ultimate shrinkage.
const GL2000_CEMENT = {
  I: { s: 0.335, K: 1.0 },
  II: { s: 0.40, K: 0.75 },
  III: { s: 0.13, K: 1.15 },
};

function validateGl2000Shrinkage({ fcm28, h, vs, tc, t, cementType }) {
  if (!(cementType in GL2000_CEMENT)) {
    throw new RangeError(`Unsupported GL2000 cement type: ${cementType}.`);
  }
  if (!Number.isFinite(fcm28) || fcm28 < 16 || fcm28 > 82) {
    throw new RangeError('GL2000 requires 16 ≤ fcm28 ≤ 82 MPa.');
  }
  if (!Number.isFinite(h) || h < 20 || h > 100) {
    throw new RangeError('GL2000 requires 20 ≤ h ≤ 100% (use 96% for sealed concrete).');
  }
  if (!Number.isFinite(vs) || vs <= 0) {
    throw new RangeError('GL2000 requires a positive volume-surface ratio V/S.');
  }
  if (!Number.isFinite(tc) || tc < 0) {
    throw new RangeError('GL2000 requires a non-negative drying-start age tc.');
  }
  if (!Number.isFinite(t) || t < 0) {
    throw new RangeError('GL2000 requires a non-negative concrete age t.');
  }
}

export function gl2000ShrinkagePoint({ fcm28, h, vs, tc, t, cementType }) {
  validateGl2000Shrinkage({ fcm28, h, vs, tc, t, cementType });
  const ultimate = 900 * GL2000_CEMENT[cementType].K * Math.sqrt(30 / fcm28);
  const betaH = 1 - 1.18 * Math.pow(h / 100, 4);
  // No drying yet: exactly zero rather than the square root of a negative age.
  const betaT = t <= tc ? 0 : Math.sqrt((t - tc) / ((t - tc) + 0.12 * vs * vs));
  const magnitude = ultimate * betaH * betaT;
  // A zero product can carry a negative sign (-0), which would print as "-0"
  // in readouts; shrinkage values are negative, zero is plain zero.
  const signed = magnitude === 0 ? 0 : -magnitude;
  return { epsilonSH: signed, epsilonAU: 0, epsilonTotal: signed, ultimate, betaH, betaT };
}

export function gl2000Shrinkage(row) {
  return gl2000ShrinkagePoint({
    fcm28: coerceNumber(row.fcm28),
    h: coerceNumber(row.h),
    vs: coerceNumber(row.vs),
    tc: coerceNumber(row.tc),
    t: coerceNumber(row.t),
    cementType: String(row.cementType).trim(),
  });
}

/**
 * GL2000 compliance, Gardner CJCE [A5]–[A6], SI units (MPa, mm, days).
 * J(t,to) = 1/Ecmto + φ28/Ecm28 with φ28 = Φ(tc)·(basic + drying);
 * E = 3500+4300√f, f_cmt from [A3]. At or before loading there is no creep
 * yet, so J is exactly the elastic compliance (C.4's first table row).
 */
function validateGl2000Compliance({ fcm28, h, vs, tc, t0, t, cementType }) {
  validateGl2000Shrinkage({ fcm28, h, vs, tc, t, cementType });
  if (!Number.isFinite(t0) || t0 < 1) {
    throw new RangeError('GL2000 requires a loading age t0 ≥ 1 day.');
  }
  if (t0 < tc) {
    throw new RangeError('GL2000 requires loading at or after drying started (t0 ≥ tc).');
  }
}

export function gl2000CompliancePoint({ fcm28, h, vs, tc, t0, t, cementType }) {
  validateGl2000Compliance({ fcm28, h, vs, tc, t0, t, cementType });
  const { s } = GL2000_CEMENT[cementType];
  const eCm28 = 3500 + 4300 * Math.sqrt(fcm28);
  const fCmto = fcm28 * Math.exp(s * (1 - Math.sqrt(28 / t0)));
  const eCmto = 3500 + 4300 * Math.sqrt(fCmto);
  const elastic = 1 / eCmto;
  if (t <= t0) return { J: elastic, phi28: 0, phiTc: 1, eCmto, eCm28, basic: 0, drying: 0 };
  const dt = t - t0;
  const phiTc = t0 === tc ? 1 : 1 - Math.sqrt((t0 - tc) / ((t0 - tc) + 0.15 * vs * vs));
  const basic = (2 * Math.pow(dt, 0.3)) / (Math.pow(dt, 0.3) + 14)
    * Math.sqrt(7 / t0) * Math.sqrt(dt / (dt + 7));
  const drying = 2.5 * (1 - 1.086 * Math.pow(h / 100, 2)) * Math.sqrt(dt / (dt + 0.12 * vs * vs));
  const phi28 = phiTc * (basic + drying);
  return { J: elastic + phi28 / eCm28, phi28, phiTc, eCmto, eCm28, basic, drying };
}

export function gl2000Compliance(row) {
  return gl2000CompliancePoint({
    fcm28: coerceNumber(row.fcm28),
    h: coerceNumber(row.h),
    vs: coerceNumber(row.vs),
    tc: coerceNumber(row.tc),
    t0: coerceNumber(row.t0),
    t: coerceNumber(row.t),
    cementType: String(row.cementType).trim(),
  });
}

/**
 * Single-row version for batch use: compliance in 1/GPa plus the shrinkage
 * triplet, mirroring b4Single/b4sSingle so the batch matrix stays uniform.
 */
export function gl2000Single(row) {
  const { J } = gl2000Compliance(row);
  const { epsilonSH, epsilonAU, epsilonTotal } = gl2000Shrinkage(row);
  return { J_GPa: J * 1000, epsilonSH, epsilonAU, epsilonTotal };
}

// ─── AASHTO LRFD ──────────────────────────────────────────────────────────
/**
 * AASHTO LRFD creep and shrinkage (NCHRP 18-07, as proposed in
 * FHWA-HRT-05-057 Appendix D for Article 5.4.2.3): creep coefficient
 * ψ(t,ti) = 1.9·ks·khc·kf·ktd·ti^−0.118 and shrinkage
 * εsh = ks·khs·kf·ktd·0.48e-3. SI in and out; the spec is inch-pound,
 * converted inside (KSI = MPa/6.89476, in = mm/25.4); V/S is capped at
 * 6.0 in per the spec. Calibration anchors (all factors unity at
 * f'ci = 4 KSI, H = 70 %, V/S = 3.5 in) come from the FHWA background text.
 * Like ACI, this is a coefficient model: no compliance, no modulus.
 * Deliberately not implemented: the one-day-accelerated-curing counts as
 * seven days ti adjustment (optional guidance, skipped and documented).
 */
function validateAashto({ fci, H, vs, ti, tc, t }) {
  const fciKsi = fci / 6.89476;
  if (!Number.isFinite(fci) || fciKsi < 2.4 || fciKsi > 15) {
    throw new RangeError('AASHTO requires 2.4 ≤ fci ≤ 15 KSI.');
  }
  if (!Number.isFinite(H) || H < 0 || H > 100) {
    throw new RangeError('AASHTO requires 0 ≤ H ≤ 100%.');
  }
  if (!Number.isFinite(vs) || vs <= 0) {
    throw new RangeError('AASHTO requires a positive volume-surface ratio V/S.');
  }
  if (!Number.isFinite(ti) || ti < 1) {
    throw new RangeError('AASHTO requires a loading age ti ≥ 1 day.');
  }
  if (!Number.isFinite(tc) || tc < 0) {
    throw new RangeError('AASHTO requires a non-negative curing-end age tc.');
  }
  if (!Number.isFinite(t) || t < 0) {
    throw new RangeError('AASHTO requires a non-negative concrete age t.');
  }
}

export function aashtoPoint({ fci, H, vs, ti, tc, t }) {
  validateAashto({ fci, H, vs, ti, tc, t });
  const fciKsi = fci / 6.89476;
  const vsIn = Math.min(vs / 25.4, 6.0);
  const ks = Math.max(1.0, 1.45 - 0.13 * vsIn);
  const khc = 1.56 - 0.008 * H;
  const khs = 2.0 - 0.014 * H;
  const kf = 5 / (1 + fciKsi);
  const dt = t - ti;
  const psi = dt <= 0 ? 0 : 1.9 * ks * khc * kf * (dt / (61 - 4 * fciKsi + dt)) * Math.pow(ti, -0.118);
  const dd = t - tc;
  let epsilonSH = 0;
  if (dd > 0) {
    epsilonSH = -(ks * khs * kf * (dd / (61 - 4 * fciKsi + dd)) * 0.48e-3) * 1e6;
    if (tc < 5) epsilonSH *= 1.2;
  }
  return { psi, epsilonSH, epsilonAU: 0, epsilonTotal: epsilonSH, ks, khc, khs, kf };
}

export function aashtoSingle(row) {
  return aashtoPoint({
    fci: coerceNumber(row.fci),
    H: coerceNumber(row.H),
    vs: coerceNumber(row.vs),
    ti: coerceNumber(row.ti),
    tc: coerceNumber(row.tc),
    t: coerceNumber(row.t),
  });
}
