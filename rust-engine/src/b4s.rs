use crate::b4::{
    aggregate, drying_creep_scale, finish, humidity_factor, normalize_humidity, shape, time_state, validate_common, FinishInput,
};
use crate::B4Result;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Serialize, Deserialize)]
pub struct B4sParams {
    pub t0: f64,
    pub t_prime: f64,
    pub t_cur: f64,
    pub t_sh: f64,
    pub t_c: f64,
    pub h: f64,
    pub fc: f64,
    pub v_s: f64,
    pub cement_type: String,
    pub aggregate_type: String,
    pub specimen_shape: String,
}

#[derive(Clone, Copy)]
struct Cement {
    tau_au_cem: f64,
    r_tau_f: f64,
    epsilon_au_cem: f64,
    r_eps_f: f64,
    alpha: f64,
    r_t: f64,
    tau_s_cem: f64,
    s_tau_f: f64,
    epsilon_s_cem: f64,
    s_eps_f: f64,
    p1: f64,
    p5e: f64,
    p5h: f64,
    s2: f64,
    s3: f64,
    s4: f64,
    s5: f64,
    s2f: f64,
    s3f: f64,
    s4f: f64,
    s5f: f64,
}

fn cement(kind: &str) -> Result<Cement, String> {
    let common = |tau_s_cem, s_tau_f, epsilon_s_cem, s_eps_f, p1, p5h, s2, s5| Cement {
        tau_au_cem: 2.26,
        r_tau_f: 0.27,
        epsilon_au_cem: 78.2e-6,
        r_eps_f: 1.03,
        alpha: 1.73,
        r_t: -1.73,
        tau_s_cem,
        s_tau_f,
        epsilon_s_cem,
        s_eps_f,
        p1,
        p5e: -0.85,
        p5h,
        s2,
        s3: 0.976,
        s4: 4e-3,
        s5,
        s2f: -1.58,
        s3f: -1.61,
        s4f: -1.16,
        s5f: -0.45,
    };
    match kind {
        "R" => Ok(common(
            0.027, 0.21, 590e-6, -0.51, 0.70, 8.0, 14.2e-3, 1.54e-3,
        )),
        "RS" => Ok(common(
            0.027, 1.55, 830e-6, -0.84, 0.60, 1.0, 29.9e-3, 41.8e-6,
        )),
        "SL" => Ok(common(
            0.032, -1.84, 640e-6, -0.69, 0.80, 8.0, 11.2e-3, 150e-6,
        )),
        _ => Err(format!("Unsupported B4 cement type: {kind}")),
    }
}

pub fn calculate_b4s_point(params: &B4sParams, t: f64) -> Result<B4Result, String> {
    validate_common(
        params.t0,
        params.t_prime,
        params.t_cur,
        params.t_sh,
        params.t_c,
        params.h,
        params.fc,
        params.v_s,
        &params.cement_type,
        &params.aggregate_type,
        &params.specimen_shape,
        t,
    )?;
    let cement = cement(&params.cement_type)?;
    let aggregate = aggregate(&params.aggregate_type)?;
    let shape = shape(&params.specimen_shape)?;
    let time = time_state(
        params.t0,
        params.t_prime,
        params.t_cur,
        params.t_sh,
        params.t_c,
        t,
    );
    let humidity = normalize_humidity(params.h)?;
    let kh = humidity_factor(humidity);
    let strength = params.fc / 40.0;
    let tau0 = cement.tau_s_cem * strength.powf(cement.s_tau_f);
    let tau_sh = tau0 * aggregate.0 * (shape * 2.0 * params.v_s).powi(2);
    let epsilon0 = cement.epsilon_s_cem * strength.powf(cement.s_eps_f);
    let e28 = 4734.0 * params.fc.sqrt() / 1000.0;
    let e1_age = 7.0 * time.beta_th + 600.0 * time.beta_ts;
    let e2_age = time.t0_tilde + tau_sh * time.beta_ts;
    let e1 = e28 * (e1_age / (4.0 + (6.0 / 7.0) * e1_age)).sqrt();
    let e2 = e28 * (e2_age / (4.0 + (6.0 / 7.0) * e2_age)).sqrt();
    let epsilon_sh_inf = -epsilon0 * aggregate.1 * e1 / e2;
    let q1 = cement.p1 / (e28 * 1000.0);
    let q2 = cement.s2 * strength.powf(cement.s2f) / 1000.0;
    let q3 = cement.s3 * q2 * strength.powf(cement.s3f);
    let q4 = cement.s4 * strength.powf(cement.s4f) / 1000.0;
    let q5 = cement.s5 * strength.powf(cement.s5f) * drying_creep_scale(kh, epsilon_sh_inf).powf(cement.p5e)
        / 1000.0;
    let epsilon_au_inf = -cement.epsilon_au_cem * strength.powf(cement.r_eps_f);
    let tau_au = cement.tau_au_cem * strength.powf(cement.r_tau_f);
    Ok(finish(FinishInput {
        t,
        t_prime: params.t_prime,
        humidity,
        time,
        epsilon_sh_inf,
        tau_sh,
        epsilon_au_inf,
        tau_au,
        alpha_au: cement.alpha,
        r_t: cement.r_t,
        q1,
        q2,
        q3,
        q4,
        q5,
        p5h: cement.p5h,
    }))
}

#[wasm_bindgen]
pub fn calculate_b4s_single(params: &JsValue, t: f64) -> Result<JsValue, JsValue> {
    let params: B4sParams = serde_wasm_bindgen::from_value(params.clone())?;
    let result = calculate_b4s_point(&params, t).map_err(|error| crate::js_error(&error))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| crate::js_error(&error.to_string()))
}

#[wasm_bindgen]
pub fn calculate_b4s_series(params: &JsValue, max_time: usize) -> Result<JsValue, JsValue> {
    crate::validate_max_time(max_time).map_err(|error| crate::js_error(&error))?;
    let params: B4sParams = serde_wasm_bindgen::from_value(params.clone())?;
    let results: Result<Vec<_>, _> = (0..=max_time)
        .map(|t| calculate_b4s_point(&params, t as f64))
        .collect();
    serde_wasm_bindgen::to_value(&results.map_err(|error| crate::js_error(&error))?)
        .map_err(|error| crate::js_error(&error.to_string()))
}

pub fn calculate_b4s_single_internal(params: &B4sParams, t: f64) -> Result<B4Result, String> {
    calculate_b4s_point(params, t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_official_b4s_benchmark() {
        let params = B4sParams {
            t0: 28.0,
            t_prime: 28.0,
            t_cur: 20.0,
            t_sh: 20.0,
            t_c: 20.0,
            h: 50.0,
            fc: 27.6,
            v_s: 19.05,
            cement_type: "R".into(),
            aggregate_type: "No Information".into(),
            specimen_shape: "1".into(),
        };
        let point = calculate_b4s_point(&params, 112.0).unwrap();
        assert!((point.epsilon_sh * 1e6 - -585.07).abs() < 0.1);
        assert!((point.epsilon_au * 1e6 - -53.27).abs() < 0.1);
        assert!((point.cd * 1e6 - 104.56).abs() < 0.1);
        assert!((point.c0 * 1e6 - 55.33).abs() < 0.1);
        assert!((point.j * 1e6 - 188.03).abs() < 0.1);
    }
}
