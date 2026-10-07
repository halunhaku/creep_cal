//! AASHTO LRFD creep and shrinkage (NCHRP 18-07).
//!
//! SI units in and out; the specification is inch-pound, converted inside
//! (KSI = MPa/6.89476, in = mm/25.4), mirroring `aashtoPoint` in
//! `src/math/creepModels.js`. V/S is capped at 6.0 in per the spec.
use crate::AashtoPoint;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Serialize, Deserialize)]
pub struct AashtoParams {
    pub fci: f64,
    pub h: f64,
    pub vs: f64,
    pub ti: f64,
    pub tc: f64,
}

fn validate(params: &AashtoParams, t: f64) -> Result<(), String> {
    let fci_ksi = params.fci / 6.89476;
    if !params.fci.is_finite() || fci_ksi < 2.4 || fci_ksi > 15.0 {
        return Err("AASHTO requires 2.4 ≤ fci ≤ 15 KSI.".into());
    }
    if !params.h.is_finite() || !(0.0..=100.0).contains(&params.h) {
        return Err("AASHTO requires 0 ≤ H ≤ 100%.".into());
    }
    if !params.vs.is_finite() || params.vs <= 0.0 {
        return Err("AASHTO requires a positive volume-surface ratio V/S.".into());
    }
    if !params.ti.is_finite() || params.ti < 1.0 {
        return Err("AASHTO requires a loading age ti ≥ 1 day.".into());
    }
    if !params.tc.is_finite() || params.tc < 0.0 {
        return Err("AASHTO requires a non-negative curing-end age tc.".into());
    }
    if !t.is_finite() || t < 0.0 {
        return Err("AASHTO requires a non-negative concrete age t.".into());
    }
    Ok(())
}

pub(crate) fn aashto_point(params: &AashtoParams, t: f64) -> Result<AashtoPoint, String> {
    validate(params, t)?;
    let fci_ksi = params.fci / 6.89476;
    let vs_in = (params.vs / 25.4).min(6.0);
    let ks = (1.45 - 0.13 * vs_in).max(1.0);
    let khc = 1.56 - 0.008 * params.h;
    let khs = 2.0 - 0.014 * params.h;
    let kf = 5.0 / (1.0 + fci_ksi);
    let dt = t - params.ti;
    let psi = if dt <= 0.0 {
        0.0
    } else {
        1.9 * ks * khc * kf * (dt / (61.0 - 4.0 * fci_ksi + dt)) * params.ti.powf(-0.118)
    };
    let dd = t - params.tc;
    let mut epsilon_sh = 0.0;
    if dd > 0.0 {
        epsilon_sh = -(ks * khs * kf * (dd / (61.0 - 4.0 * fci_ksi + dd)) * 0.48e-3) * 1e6;
        if params.tc < 5.0 {
            epsilon_sh *= 1.2;
        }
    }
    // Match the JS kernel's plain-zero convention (see its -0 normalisation).
    let epsilon_sh = if epsilon_sh == 0.0 { 0.0 } else { epsilon_sh };
    Ok(AashtoPoint {
        t,
        psi,
        epsilon_sh,
        epsilon_au: 0.0,
        epsilon_total: epsilon_sh,
        ks,
        khc,
        khs,
        kf,
    })
}

/// AASHTO LRFD creep coefficient and shrinkage at concrete age t.
#[wasm_bindgen]
pub fn calculate_aashto_single(params: &JsValue, t: f64) -> Result<JsValue, JsValue> {
    let params: AashtoParams = serde_wasm_bindgen::from_value(params.clone())?;
    let result = aashto_point(&params, t).map_err(|error| crate::js_error(&error))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| crate::js_error(&error.to_string()))
}

/// AASHTO LRFD time series indexed by concrete age from casting.
#[wasm_bindgen]
pub fn calculate_aashto_series(params: &JsValue, max_time: usize) -> Result<JsValue, JsValue> {
    crate::validate_max_time(max_time).map_err(|error| crate::js_error(&error))?;
    let params: AashtoParams = serde_wasm_bindgen::from_value(params.clone())?;
    let results: Result<Vec<_>, _> = (0..=max_time).map(|t| aashto_point(&params, t as f64)).collect();
    serde_wasm_bindgen::to_value(&results.map_err(|error| crate::js_error(&error))?)
        .map_err(|error| crate::js_error(&error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> AashtoParams {
        AashtoParams { fci: 41.0, h: 70.0, vs: 89.0, ti: 7.0, tc: 7.0 }
    }

    #[test]
    fn anchors_match_fhwa_background() {
        // All factors unity at f'ci = 4 KSI, H = 70 %, V/S = 3.5 in.
        let psi = |fci: f64, h: f64, vs: f64| {
            aashto_point(&AashtoParams { fci, h, vs, ti: 28.0, tc: 7.0 }, 365.0).unwrap().psi
        };
        assert!((psi(4.0 * 6.89476, 70.0, 88.9) / psi(4.0 * 6.89476, 50.0, 88.9) - 1.0 / 1.16).abs() < 1e-9);
        assert!((psi(4.0 * 6.89476, 70.0, 88.9) / psi(4.0 * 6.89476, 70.0, 25.4) - 1.0 / 1.32).abs() < 1e-9);
    }

    #[test]
    fn zeros_before_loading_and_drying() {
        let at = aashto_point(&base(), 7.0).unwrap();
        assert_eq!(at.psi, 0.0);
        assert_eq!(at.epsilon_sh, 0.0);
    }
}
