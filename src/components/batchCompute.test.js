import { describe, expect, test } from 'vitest';
import { computeRow, computeRowsChunk, formatResult } from './batchCompute';
import {
  aashtoSingle,
  aci209Single,
  b4Single,
  b4sSingle,
  gl2000Single,
  mc2010Single,
} from '../math/creepModels';

describe('batchCompute pure module', () => {
  test('formatResult keeps finite output and rejects NaN', () => {
    expect(formatResult(1.23456, 4, 'x')).toBe('1.2346');
    expect(() => formatResult(NaN, 4, 'x')).toThrow(RangeError);
  });

  test('computeRow matches direct kernel Singles', () => {
    expect(computeRow('aci209', { curingType: 'moist', t0: 28, H: 70, VS: 100, slump: 100, fineAggregate: 50, airContent: 8, t: 365 }))
      .toEqual({ result_phi: aci209Single({ curingType: 'moist', t0: 28, H: 70, VS: 100, slump: 100, fineAggregate: 50, airContent: 8, t: 365 }).toFixed(4) });
    const mc = { fcm: 40, RH: 70, t0: 28, Ac: 90000, u: 1200, T: 20, Cs: '42.5 R', sigma: 12, t: 365 };
    const mcOut = mc2010Single(mc);
    expect(computeRow('mc2010', mc).result_phi).toBe(mcOut.phi.toFixed(4));
    const b4 = { t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 27.6, vS: 19.05, c: 219.3, wC: 0.6, aC: 7, cementType: 'R', aggregateType: 'No Information', specimenShape: '1', retarder: 0, flyAsh: 0, superplasticizer: 0, silicaFume: 0, airEntrainingAgent: 0, waterReducer: 0, t: 112 };
    expect(computeRow('b4', b4).result_J_GPa).toBe(b4Single(b4).J_GPa.toFixed(6));
    const b4s = { ...b4 };
    delete b4s.c; delete b4s.wC; delete b4s.aC;
    for (const key of ['retarder', 'flyAsh', 'superplasticizer', 'silicaFume', 'airEntrainingAgent', 'waterReducer']) delete b4s[key];
    expect(computeRow('b4s', b4s).result_J_GPa).toBe(b4sSingle(b4s).J_GPa.toFixed(6));
    const gl = { fcm28: 32.5, h: 70, vs: 100, tc: 7, t0: 28, cementType: 'I', t: 365 };
    expect(computeRow('gl2000', gl).result_J_GPa).toBe(gl2000Single(gl).J_GPa.toFixed(6));
    const aashto = { fci: 41, H: 70, vs: 89, ti: 7, tc: 7, t: 365 };
    expect(computeRow('aashto', aashto).result_psi).toBe(aashtoSingle(aashto).psi.toFixed(4));
  });

  test('computeRowsChunk numbers issues from the given start row', () => {
    const good = { curingType: 'moist', t0: 28, H: 70, VS: 100, slump: 100, fineAggregate: 50, airContent: 8, t: 365 };
    const bad = { ...good, H: 500 };
    const { results, issues } = computeRowsChunk('aci209', [good, bad], 2);
    expect(results).toHaveLength(2);
    expect(results[0].__status).toBe('valid');
    expect(results[1].__status).toBe('invalid');
    expect(issues).toHaveLength(1);
    expect(issues[0].row).toBe(3);
  });
});
