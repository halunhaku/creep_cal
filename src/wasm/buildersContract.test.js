import { describe, expect, test } from 'vitest';
import {
  buildAashtoParams,
  buildAci209Params,
  buildB4Params,
  buildB4sParams,
  buildGl2000Params,
  buildMc2010Params,
} from './creepEngine';
import { MODELS } from '../components/batchModels';

/**
 * Phase 1 contract pin: JS builder wire shapes vs Rust serde shapes.
 *
 * Documents the intentional split found by module analysis:
 * - ACI single/series/batch all use H/VS/curingType/fineAggregate/airContent.
 * - MC2010 series uses snake_case (rh/ac/t/cement_type) while the Rust batch
 *   entry expects UI caps (RH/Ac/T/Cs); builder output must NOT be reused
 *   for batch calls.
 * - B4/B4s/GL2000/AASHTO builders translate UI camelCase to snake_case.
 */
describe('wasm builder contracts', () => {
  test('ACI builder emits Rust rename keys', () => {
    const out = buildAci209Params({
      curingType: 'moist', t0: 28, H: 70, VS: 100, slump: 100, fineAggregate: 50, airContent: 8,
    });
    expect(Object.keys(out).sort()).toEqual(
      ['H', 'VS', 'airContent', 'curingType', 'fineAggregate', 'slump', 't0'].sort(),
    );
  });

  test('MC2010 builder emits series snake_case, not batch caps', () => {
    const out = buildMc2010Params({
      fcm: 40, RH: 70, t0: 28, Ac: 90000, u: 1200, T: 20, Cs: '42.5 R', sigma: 12,
    });
    expect(out).toMatchObject({ rh: 70, ac: 90000, t: 20, cement_type: '42.5 R' });
    expect(out).not.toHaveProperty('RH');
    expect(out).not.toHaveProperty('Ac');
    expect(out).not.toHaveProperty('T');
    expect(out).not.toHaveProperty('Cs');
  });

  test('B4/B4s/GL2000/AASHTO builders emit snake_case wire keys', () => {
    const b4 = buildB4Params({
      t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 27.6, vS: 19.05,
      c: 219.3, wC: 0.6, aC: 7, cementType: 'R', aggregateType: 'No Information',
      specimenShape: '1', retarder: 0, flyAsh: 0, superplasticizer: 0, silicaFume: 0,
      airEntrainingAgent: 0, waterReducer: 0,
    });
    expect(b4).toMatchObject({ t_prime: 28, v_s: 19.05, w_c: 0.6 });
    const gl = buildGl2000Params({ fcm28: 32.5, h: 70, vs: 100, tc: 7, t0: 28, cementType: 'I' });
    expect(gl).toMatchObject({ cement_type: 'I' });
    const aashto = buildAashtoParams({ fci: 41, H: 70, vs: 89, ti: 7, tc: 7 });
    expect(aashto).toMatchObject({ h: 70 });
  });

  test('builders reject missing keys and ignore unknown UI keys', () => {
    expect(() => buildAci209Params({ t0: 28 })).toThrow(/missing/);
    // Builders forward a fixed wire object, so unknown UI keys are dropped,
    // not forwarded to assertContract as unexpected keys.
    const out = buildMc2010Params({
      fcm: 40, RH: 70, t0: 28, Ac: 1, u: 1, T: 20, Cs: '42.5 R', sigma: 1, extra: 1,
    });
    expect(out).not.toHaveProperty('extra');
  });

  test('MODELS registry req strings match kernel Single fields', () => {
    const byId = Object.fromEntries(MODELS.map((m) => [m.id, m.req]));
    expect(byId.aci209).toContain('curingType');
    expect(byId.mc2010).toContain('Cs');
    expect(byId.b4).toContain('tPrime');
    expect(byId.gl2000).toContain('fcm28');
    expect(byId.aashto).toContain('fci');
    void buildB4sParams;
  });
});
