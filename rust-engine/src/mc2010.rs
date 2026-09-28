use crate::Mc2010Params;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Serialize)]
pub struct Mc2010Point {
    pub t: f64,
    pub phi: f64,
    pub phi_bc: f64,
    pub phi_dc: f64,
    pub nonlinear_factor: f64,
    pub t0_adjusted: f64,
}

fn cement_alpha(cement_type: &str) -> Result<f64, String> {
    match cement_type {
        "32.5 N" => Ok(-1.0),
        "32.5 R" | "42.5 N" => Ok(0.0),
        "42.5 R" | "52.5 N" | "52.5 R" => Ok(1.0),
        _ => Err(format!("Unsupported MC2010 cement class: {cement_type}")),
    }
}

fn validate(params: &Mc2010Params) -> Result<(), String> {
    if !params.fcm.is_finite() || !(20.0..=130.0).contains(&params.fcm) {
        return Err("MC2010 requires 20 ≤ fcm ≤ 130 MPa.".into());
    }
    if !params.rh.is_finite() || !(40.0..=100.0).contains(&params.rh) {
        return Err("MC2010 requires 40 ≤ RH ≤ 100%.".into());
    }
    if !params.t0.is_finite() || params.t0 < 1.0 {
        return Err("MC2010 requires t0 ≥ 1 day.".into());
    }
    if !params.ac.is_finite() || params.ac <= 0.0 || !params.u.is_finite() || params.u <= 0.0 {
        return Err("MC2010 requires positive Ac and u values.".into());
    }
    if !params.t.is_finite() || !(5.0..=30.0).contains(&params.t) {
        return Err("MC2010 standard creep model requires 5 ≤ T ≤ 30°C.".into());
    }
    cement_alpha(&params.cement_type)?;
    if !params.sigma.is_finite() || params.sigma.abs() > 0.6 * params.fcm {
        return Err("MC2010 requires |sigma| ≤ 0.6 fcm.".into());
    }
    Ok(())
}

fn calculate_point(params: &Mc2010Params, concrete_age: f64) -> Result<Mc2010Point, String> {
    validate(params)?;
    if !concrete_age.is_finite() {
        return Err("MC2010 requires a finite concrete age t.".into());
    }

    let alpha = cement_alpha(&params.cement_type)?;
    let temperature_adjusted_age = params.t0 * (13.65 - 4000.0 / (273.0 + params.t)).exp();
    let t0_adjusted = (temperature_adjusted_age
        * ((9.0 / (2.0 + temperature_adjusted_age.powf(1.2))) + 1.0).powf(alpha))
    .max(0.5);
    let stress_ratio = (params.sigma / params.fcm).abs();
    let nonlinear_factor = if stress_ratio > 0.4 {
        (1.5 * (stress_ratio - 0.4)).exp()
    } else {
        1.0
    };
    let elapsed = concrete_age - params.t0;

    if elapsed <= 0.0 {
        return Ok(Mc2010Point {
            t: concrete_age,
            phi: 0.0,
            phi_bc: 0.0,
            phi_dc: 0.0,
            nonlinear_factor,
            t0_adjusted,
        });
    }

    let notional_size = (2.0 * params.ac) / params.u;
    let alpha_fcm = (35.0 / params.fcm).sqrt();
    let beta_h = (1.5 * notional_size + 250.0 * alpha_fcm).min(1500.0 * alpha_fcm);
    let phi_bc = (1.8 / params.fcm.powf(0.7))
        * (((30.0 / t0_adjusted) + 0.035).powi(2) * elapsed + 1.0).ln();
    let gamma_t0 = 1.0 / (2.3 + 3.5 / t0_adjusted.sqrt());
    let phi_dc = (412.0 / params.fcm.powf(1.4))
        * ((1.0 - params.rh / 100.0) / (0.1 * (notional_size / 100.0)).powf(1.0 / 3.0))
        * (1.0 / (0.1 + t0_adjusted.powf(0.2)))
        * (elapsed / (beta_h + elapsed)).powf(gamma_t0);

    Ok(Mc2010Point {
        t: concrete_age,
        phi: (phi_bc + phi_dc) * nonlinear_factor,
        phi_bc,
        phi_dc,
        nonlinear_factor,
        t0_adjusted,
    })
}

/// Published fib Model Code 2010 creep result at concrete age t.
#[wasm_bindgen]
pub fn calculate_mc2010_single(params: &JsValue, t: f64) -> Result<JsValue, JsValue> {
    let params: Mc2010Params = serde_wasm_bindgen::from_value(params.clone())?;
    let point = calculate_point(&params, t).map_err(|error| JsValue::from_str(&error))?;
    serde_wasm_bindgen::to_value(&point).map_err(|error| JsValue::from_str(&error.to_string()))
}

/// Published fib Model Code 2010 series indexed by concrete age from casting.
#[wasm_bindgen]
pub fn calculate_mc2010_series(params: &JsValue, max_time: usize) -> Result<JsValue, JsValue> {
    let params: Mc2010Params = serde_wasm_bindgen::from_value(params.clone())?;
    validate(&params).map_err(|error| JsValue::from_str(&error))?;
    let mut results = Vec::with_capacity(max_time + 1);

    for t in 0..=max_time {
        results
            .push(calculate_point(&params, t as f64).map_err(|error| JsValue::from_str(&error))?);
    }

    serde_wasm_bindgen::to_value(&results).map_err(|error| JsValue::from_str(&error.to_string()))
}

/// Published fib Model Code 2010 batch calculation.
#[wasm_bindgen]
pub fn calculate_mc2010_batch(batch_data: &JsValue) -> Result<JsValue, JsValue> {
    #[derive(Deserialize, Serialize)]
    struct BatchItem {
        fcm: f64,
        #[serde(rename = "RH")]
        rh: f64,
        t0: f64,
        #[serde(rename = "Ac")]
        ac: f64,
        u: f64,
        #[serde(rename = "T")]
        curing_temperature: f64,
        #[serde(rename = "Cs")]
        cement_type: String,
        sigma: f64,
        t: f64,
    }

    #[derive(Serialize)]
    struct BatchResult {
        phi: f64,
        phi_bc: f64,
        phi_dc: f64,
        nonlinear_factor: f64,
        #[serde(flatten)]
        original: serde_json::Value,
    }

    let batch: Vec<BatchItem> = serde_wasm_bindgen::from_value(batch_data.clone())?;
    let results: Result<Vec<BatchResult>, JsValue> = batch
        .into_iter()
        .map(|item| {
            let params = Mc2010Params {
                fcm: item.fcm,
                rh: item.rh,
                t0: item.t0,
                ac: item.ac,
                u: item.u,
                t: item.curing_temperature,
                cement_type: item.cement_type.clone(),
                sigma: item.sigma,
            };
            let point =
                calculate_point(&params, item.t).map_err(|error| JsValue::from_str(&error))?;
            Ok(BatchResult {
                phi: point.phi,
                phi_bc: point.phi_bc,
                phi_dc: point.phi_dc,
                nonlinear_factor: point.nonlinear_factor,
                original: serde_json::to_value(&item)
                    .expect("serializing a valid MC2010 batch item"),
            })
        })
        .collect();

    serde_wasm_bindgen::to_value(&results?).map_err(|error| JsValue::from_str(&error.to_string()))
}

pub fn calculate_mc2010_single_internal(
    params: &Mc2010Params,
    t: f64,
) -> Result<Mc2010Point, String> {
    calculate_point(params, t)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn official_case(sigma: f64) -> Mc2010Params {
        Mc2010Params {
            fcm: 28.0,
            rh: 40.0,
            t0: 7.0,
            ac: 75_000.0,
            u: 1_000.0,
            t: 20.0,
            cement_type: "32.5 R".into(),
            sigma,
        }
    }

    #[test]
    fn matches_official_linear_benchmark() {
        let point = calculate_point(&official_case(10.0), 14.0).unwrap();
        assert!((point.phi_bc - 0.853184).abs() < 1e-5);
        assert!((point.phi_dc - 0.85125).abs() < 1e-5);
        assert!((point.phi - 1.70443).abs() < 1e-4);
    }

    #[test]
    fn matches_official_nonlinear_benchmark() {
        let point = calculate_point(&official_case(-15.0), 14.0).unwrap();
        assert!((point.phi - 2.08924).abs() < 1e-4);
    }

    #[test]
    fn enforces_adjusted_age_floor_and_loading_origin() {
        let params = Mc2010Params {
            fcm: 40.0,
            rh: 70.0,
            t0: 1.0,
            ac: 75_000.0,
            u: 1_000.0,
            t: 5.0,
            cement_type: "32.5 N".into(),
            sigma: 12.0,
        };
        let before = calculate_point(&params, 0.0).unwrap();
        let loaded = calculate_point(&params, 1.0).unwrap();
        let later = calculate_point(&params, 365.0).unwrap();
        assert_eq!(before.phi, 0.0);
        assert_eq!(loaded.phi, 0.0);
        assert_eq!(later.t0_adjusted, 0.5);
        assert!((later.phi - 3.1414340357353483).abs() < 1e-12);
    }
}
