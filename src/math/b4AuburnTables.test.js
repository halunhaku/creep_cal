import { describe, expect, test } from 'vitest';
import { B4_AGGREGATE, B4_CEMENT } from './creepModels';

/**
 * Auburn ALDOT 930-989 third-source check.
 *
 * Beauchamp, Cooper, Schindler & Barnes (Dec 2023), "Characterization of
 * Concrete Creep and Shrinkage of the Birmingham I-59/I-20 Segmental Bridge",
 * ALDOT Report 930-989 (open PDF, eng.auburn.edu): Table 3-5 (report p.40),
 * Table 3-6 and Table 3-7 (report p.42), all "for the B4 model (Bažant 2015)".
 *
 * The kernel tables were previously verified against the IIT Madras thesis
 * Tables 2.1–2.6 and the Zdanowicz TC-242-MDC script (see bug-audit N-19);
 * Auburn is the independent third witness, so every shared cell is pinned
 * here exactly as printed. The kernel's extra 'No Information' aggregate
 * (neutral 1/1) is an app-side default and is not part of Auburn Table 3-7.
 */
const TABLE_3_5 = {
  R:  { p1: 0.70, p2: 58.6e-3, p3: 39.3e-3, p4: 3.4e-3, p5: 777e-6, p5H: 8, p2w: 3, p3a: -1.1, p3w: 0.4, p4a: -0.9, p4w: 2.45, p5e: -0.85, p5a: -1, p5w: 0.78 },
  RS: { p1: 0.60, p2: 17.4e-3, p3: 39.3e-3, p4: 3.4e-3, p5: 94.6e-6, p5H: 1, p2w: 3, p3a: -1.1, p3w: 0.4, p4a: -0.9, p4w: 2.45, p5e: -0.85, p5a: -1, p5w: 0.78 },
  SL: { p1: 0.80, p2: 40.5e-3, p3: 39.3e-3, p4: 3.4e-3, p5: 496e-6, p5H: 8, p2w: 3, p3a: -1.1, p3w: 0.4, p4a: -0.9, p4w: 2.45, p5e: -0.85, p5a: -1, p5w: 0.78 },
};

const TABLE_3_6 = {
  R:  { tauCem: 0.016, tauA: -0.33, tauW: -0.06, tauC: -0.1, epsilonCem: 360e-6, epsA: -0.8, epsW: 1.1, epsC: 0.11 },
  RS: { tauCem: 0.08, tauA: -0.33, tauW: -2.4, tauC: -2.7, epsilonCem: 860e-6, epsA: -0.8, epsW: -0.27, epsC: 0.11 },
  SL: { tauCem: 0.01, tauA: -0.33, tauW: 3.55, tauC: 3.8, epsilonCem: 410e-6, epsA: -0.8, epsW: 1, epsC: 0.11 },
};

const TABLE_3_7 = {
  Diabase: { tau: 0.06, epsilon: 0.76 },
  Quartzite: { tau: 0.59, epsilon: 0.71 },
  Limestone: { tau: 1.8, epsilon: 0.95 },
  Sandstone: { tau: 2.3, epsilon: 1.6 },
  Granite: { tau: 4, epsilon: 1.05 },
  'Quartz Diorite': { tau: 15, epsilon: 2.2 },
};

describe('Auburn ALDOT 930-989 B4 parameter tables', () => {
  test.each(['R', 'RS', 'SL'])('Table 3-5 creep parameters match for %s cement', (cement) => {
    for (const [key, value] of Object.entries(TABLE_3_5[cement])) {
      expect(B4_CEMENT[cement][key]).toBe(value);
    }
  });

  test.each(['R', 'RS', 'SL'])('Table 3-6 shrinkage parameters match for %s cement', (cement) => {
    for (const [key, value] of Object.entries(TABLE_3_6[cement])) {
      expect(B4_CEMENT[cement][key]).toBe(value);
    }
  });

  test.each(Object.keys(TABLE_3_7))('Table 3-7 aggregate factors match for %s', (aggregate) => {
    expect(B4_AGGREGATE[aggregate].tau).toBe(TABLE_3_7[aggregate].tau);
    expect(B4_AGGREGATE[aggregate].epsilon).toBe(TABLE_3_7[aggregate].epsilon);
  });
});
