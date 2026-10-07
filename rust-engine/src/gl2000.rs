//! GL2000 shrinkage and creep, Gardner & Lockman 2001.
//!
//! SI units throughout (MPa, mm, days), mirroring `gl2000ShrinkagePoint` and
//! `gl2000CompliancePoint` in `src/math/creepModels.js`: shrinkage
//! εsh = εshu·β(h)·β(t), compliance J = 1/Ecmto + φ28/Ecm28 with
//! φ28 = Φ(tc)·(basic + drying). See the JS kernel header and
//! `docs/benchmark-sources.md` for the source arbitration (C.4 creep table
//! disqualified, Gardner's own appendix rules).
use crate::Gl2000Point;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Serialize, Deserialize)]
pub struct Gl2000Params {
    pub fcm28: f64,
    pub h: f64,
    pub vs: f64,
    pub tc: f64,
    pub t0: f64,
    pub cement_type: String,
}

#[derive(Clone, Copy)]
struct Cement {
    s: f64,
    k: f64,
}

fn cement(kind: &str) -> Result<Cement, String> {
    match kind {
        "I" => Ok(Cement { s: 0.335, k: 1.0 }),
        "II" => Ok(Cement { s: 0.40, k: 0.75 }),
        "III" => Ok(Cement { s: 0.13, k: 1.15 }),
        _ => Err(format!("Unsupported GL2000 cement type: {kind}.")),
    }
}

fn validate(params: &Gl2000Params, t: f64, need_loading: bool) -> Result<Cement, String> {
    let cement = cement(&params.cement_type)?;
    if !params.fcm28.is_finite() || !(16.0..=82.0).contains(&params.fcm28) {
        return Err("GL2000 requires 16 ≤ fcm28 ≤ 82 MPa.".into());
    }
    if !params.h.is_finite() || !(20.0..=100.0).contains(&params.h) {
        return Err("GL2000 requires 20 ≤ h ≤ 100% (use 96% for sealed concrete).".into());
    }
    if !params.vs.is_finite() || params.vs <= 0.0 {
        return Err("GL2000 requires a positive volume-surface ratio V/S.".into());
    }
    if !params.tc.is_finite() || params.tc < 0.0 {
        return Err("GL2000 requires a non-negative drying-start age tc.".into());
    }
    if !params.t0.is_finite() || params.t0 < 1.0 {
        return Err("GL2000 requires a loading age t0 ≥ 1 day.".into());
    }
    if need_loading && params.t0 < params.tc {
        return Err("GL2000 requires loading at or after drying started (t0 ≥ tc).".into());
    }
    if !t.is_finite() || t < 0.0 {
        return Err("GL2000 requires a non-negative concrete age t.".into());
    }
    Ok(cement)
}

fn modulus(strength_mpa: f64) -> f64 {
    3500.0 + 4300.0 * strength_mpa.sqrt()
}

pub(crate) fn gl2000_point(params: &Gl2000Params, t: f64) -> Result<Gl2000Point, String> {
    let cement = validate(params, t, true)?;
    let hr = params.h / 100.0;
    let ultimate = 900.0 * cement.k * (30.0 / params.fcm28).sqrt();
    let beta_h = 1.0 - 1.18 * hr.powi(4);
    let beta_t = if t <= params.tc {
        0.0
    } else {
        ((t - params.tc) / ((t - params.tc) + 0.12 * params.vs * params.vs)).sqrt()
    };
    let magnitude = ultimate * beta_h * beta_t;
    let signed = if magnitude == 0.0 { 0.0 } else { -magnitude };
    let e_cm28 = modulus(params.fcm28);
    let f_cmto = params.fcm28 * (cement.s * (1.0 - (28.0 / params.t0).sqrt())).exp();
    let e_cmto = modulus(f_cmto);
    let elastic = 1.0 / e_cmto;
    if t <= params.t0 {
        return Ok(Gl2000Point {
            t,
            j: elastic,
            epsilon_sh: signed,
            epsilon_au: 0.0,
            epsilon_total: signed,
            ultimate,
            beta_h,
            beta_t,
            phi28: 0.0,
            phi_tc: 1.0,
            e_cmto,
            e_cm28,
            basic: 0.0,
            drying: 0.0,
        });
    }
    let dt = t - params.t0;
    let phi_tc = if params.t0 == params.tc {
        1.0
    } else {
        1.0 - ((params.t0 - params.tc) / ((params.t0 - params.tc) + 0.15 * params.vs * params.vs)).sqrt()
    };
    let dt03 = dt.powf(0.3);
    let basic = (2.0 * dt03) / (dt03 + 14.0) * (7.0 / params.t0).sqrt() * (dt / (dt + 7.0)).sqrt();
    let drying = 2.5 * (1.0 - 1.086 * hr * hr) * (dt / (dt + 0.12 * params.vs * params.vs)).sqrt();
    let phi28 = phi_tc * (basic + drying);
    Ok(Gl2000Point {
        t,
        j: elastic + phi28 / e_cm28,
        epsilon_sh: signed,
        epsilon_au: 0.0,
        epsilon_total: signed,
        ultimate,
        beta_h,
        beta_t,
        phi28,
        phi_tc,
        e_cmto,
        e_cm28,
        basic,
        drying,
    })
}

/// GL2000 compliance and shrinkage at concrete age t.
#[wasm_bindgen]
pub fn calculate_gl2000_single(params: &JsValue, t: f64) -> Result<JsValue, JsValue> {
    let params: Gl2000Params = serde_wasm_bindgen::from_value(params.clone())?;
    let result = gl2000_point(&params, t).map_err(|error| crate::js_error(&error))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| crate::js_error(&error.to_string()))
}

/// GL2000 time series indexed by concrete age from casting.
#[wasm_bindgen]
pub fn calculate_gl2000_series(params: &JsValue, max_time: usize) -> Result<JsValue, JsValue> {
    crate::validate_max_time(max_time).map_err(|error| crate::js_error(&error))?;
    let params: Gl2000Params = serde_wasm_bindgen::from_value(params.clone())?;
    let results: Result<Vec<_>, _> = (0..=max_time).map(|t| gl2000_point(&params, t as f64)).collect();
    serde_wasm_bindgen::to_value(&results.map_err(|error| crate::js_error(&error))?)
        .map_err(|error| crate::js_error(&error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Gl2000Params {
        Gl2000Params { fcm28: 32.5, h: 70.0, vs: 100.0, tc: 7.0, t0: 14.0, cement_type: "I".into() }
    }

    #[test]
    fn shrinkage_matches_c43_magnitudes() {
        // ACI 209.2R-08 C.4.3 (magnitudes; the kernel signs shrinkage negative).
        for (t, expected) in [(7.0, 0.0), (28.0, 81.0), (60.0, 128.0), (180.0, 220.0), (365.0, 297.0)] {
            let got = -gl2000_point(&base(), t).unwrap().epsilon_sh;
            assert!((got - expected).abs() < 1.0, "t={t}: got {got}, want {expected}");
        }
    }

    #[test]
    fn elastic_chain_matches_c44() {
        let at = gl2000_point(&base(), 14.0).unwrap();
        assert!((at.e_cm28 - 28014.0).abs() < 0.5);
        assert!((at.e_cmto - 26371.0).abs() < 5.0);
        assert!((at.j - 37.92e-6).abs() < 5e-9);
    }

    #[test]
    fn rejects_loading_before_drying() {
        let bad = Gl2000Params { t0: 3.0, tc: 7.0, ..base() };
        assert!(gl2000_point(&bad, 365.0).is_err());
    }
}
