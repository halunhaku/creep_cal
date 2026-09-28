use crate::B4Result;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Serialize, Deserialize)]
pub struct B4Params {
    pub t0: f64,
    pub t_prime: f64,
    pub t_cur: f64,
    pub t_sh: f64,
    pub t_c: f64,
    pub h: f64,
    pub fc: f64,
    pub v_s: f64,
    pub c: f64,
    pub w_c: f64,
    pub a_c: f64,
    pub cement_type: String,
    pub aggregate_type: String,
    pub specimen_shape: String,
    #[serde(default)]
    pub retarder: f64,
    #[serde(default)]
    pub fly_ash: f64,
    #[serde(default)]
    pub superplasticizer: f64,
    #[serde(default)]
    pub silica_fume: f64,
    #[serde(default)]
    pub air_entraining_agent: f64,
    #[serde(default)]
    pub water_reducer: f64,
}

#[derive(Clone, Copy)]
struct Cement {
    tau_cem: f64,
    epsilon_cem: f64,
    tau_au_cem: f64,
    epsilon_au_cem: f64,
    r_eps_a: f64,
    r_eps_w: f64,
    r_tau_w: f64,
    r_alpha: f64,
    r_t: f64,
    tau_a: f64,
    tau_w: f64,
    tau_c: f64,
    eps_a: f64,
    eps_w: f64,
    eps_c: f64,
    p1: f64,
    p2: f64,
    p3: f64,
    p4: f64,
    p5: f64,
    p5h: f64,
    p2w: f64,
    p3a: f64,
    p3w: f64,
    p4a: f64,
    p4w: f64,
    p5a: f64,
    p5w: f64,
    p5e: f64,
}

fn cement(kind: &str) -> Result<Cement, String> {
    let common = |tau_cem,
                  epsilon_cem,
                  tau_au_cem,
                  epsilon_au_cem,
                  r_alpha,
                  tau_w,
                  tau_c,
                  eps_w,
                  p1,
                  p2,
                  p5,
                  p5h| Cement {
        tau_cem,
        epsilon_cem,
        tau_au_cem,
        epsilon_au_cem,
        r_eps_a: -0.75,
        r_eps_w: -3.5,
        r_tau_w: 3.0,
        r_alpha,
        r_t: -4.5,
        tau_a: -0.33,
        tau_w,
        tau_c,
        eps_a: -0.8,
        eps_w,
        eps_c: 0.11,
        p1,
        p2,
        p3: 39.3e-3,
        p4: 3.4e-3,
        p5,
        p5h,
        p2w: 3.0,
        p3a: -1.1,
        p3w: 0.4,
        p4a: -0.9,
        p4w: 2.45,
        p5a: -1.0,
        p5w: 0.78,
        p5e: -0.85,
    };
    match kind {
        "R" => Ok(common(
            0.016, 360e-6, 1.0, 210e-6, 1.0, -0.06, -0.1, 1.1, 0.70, 58.6e-3, 777e-6, 8.0,
        )),
        "RS" => Ok(common(
            0.08, 860e-6, 41.0, -84e-6, 1.4, -2.4, -2.7, -0.27, 0.60, 17.4e-3, 94.6e-6, 1.0,
        )),
        "SL" => Ok(common(
            0.01, 410e-6, 1.0, 0.0, 1.0, 3.55, 3.8, 1.0, 0.80, 40.5e-3, 496e-6, 8.0,
        )),
        _ => Err(format!("Unsupported B4 cement type: {kind}")),
    }
}

pub(crate) fn aggregate(kind: &str) -> Result<(f64, f64), String> {
    match kind {
        "Diabase" => Ok((0.06, 0.76)),
        "Quartzite" => Ok((0.59, 0.71)),
        "Limestone" => Ok((1.8, 0.95)),
        "Sandstone" => Ok((2.3, 1.6)),
        "Granite" => Ok((4.0, 1.05)),
        "Quartz Diorite" => Ok((15.0, 2.2)),
        "No Information" => Ok((1.0, 1.0)),
        _ => Err(format!("Unsupported B4 aggregate type: {kind}")),
    }
}

pub(crate) fn shape(code: &str) -> Result<f64, String> {
    match code {
        "1" => Ok(1.0),
        "2" => Ok(1.15),
        "3" => Ok(1.25),
        "4" => Ok(1.3),
        "5" => Ok(1.55),
        _ => Err(format!("Unsupported B4 specimen shape: {code}")),
    }
}

pub(crate) fn normalize_humidity(value: f64) -> Result<f64, String> {
    let humidity = if value > 1.0 { value / 100.0 } else { value };
    if humidity.is_finite() && (0.0..=1.0).contains(&humidity) {
        Ok(humidity)
    } else {
        Err("B4 requires relative humidity between 0 and 100%.".into())
    }
}

pub(crate) fn validate_common(
    t0: f64,
    t_prime: f64,
    t_cur: f64,
    t_sh: f64,
    t_c: f64,
    h: f64,
    fc: f64,
    v_s: f64,
    cement_type: &str,
    aggregate_type: &str,
    specimen_shape: &str,
    t: f64,
) -> Result<(), String> {
    if !t0.is_finite() || t0 < 1.0 || !t_prime.is_finite() || t_prime < 1.0 {
        return Err("B4 is not intended for concrete younger than 1 day.".into());
    }
    if !t.is_finite() || t < 0.0 {
        return Err("B4 requires a non-negative concrete age t.".into());
    }
    if !fc.is_finite() || !(15.0..=70.0).contains(&fc) {
        return Err("B4 calibration range is 15 ≤ fc ≤ 70 MPa.".into());
    }
    if !v_s.is_finite() || !(12.0..=120.0).contains(&v_s) {
        return Err("B4 calibration range is 12 ≤ V/S ≤ 120 mm.".into());
    }
    if !t_cur.is_finite() || !(20.0..=30.0).contains(&t_cur) {
        return Err("B4 curing-temperature range is 20 ≤ Tcur ≤ 30°C.".into());
    }
    if !t_sh.is_finite()
        || !(-25.0..=75.0).contains(&t_sh)
        || !t_c.is_finite()
        || !(-25.0..=75.0).contains(&t_c)
    {
        return Err("B4 environmental-temperature range is -25 ≤ T ≤ 75°C.".into());
    }
    normalize_humidity(h)?;
    cement(cement_type)?;
    aggregate(aggregate_type)?;
    shape(specimen_shape)?;
    Ok(())
}

fn acceleration(temperature: f64) -> f64 {
    (4000.0 * (1.0 / 293.0 - 1.0 / (temperature + 273.0))).exp()
}

pub(crate) struct TimeState {
    pub beta_th: f64,
    pub beta_ts: f64,
    pub beta_tc: f64,
    pub t0_tilde: f64,
    pub t_prime_hat: f64,
    pub t_hat: f64,
    pub drying_duration: f64,
    pub equivalent_age: f64,
}

pub(crate) fn time_state(
    t0: f64,
    t_prime: f64,
    t_cur: f64,
    t_sh: f64,
    t_c: f64,
    t: f64,
) -> TimeState {
    let beta_th = acceleration(t_cur);
    let beta_ts = acceleration(t_sh);
    let beta_tc = acceleration(t_c);
    let t0_tilde = t0 * beta_th;
    let t_prime_hat = if t_prime >= t0 {
        t0_tilde + (t_prime - t0) * beta_ts
    } else {
        t_prime * beta_th
    };
    let t_hat = if t >= t_prime {
        t_prime_hat + (t - t_prime) * beta_tc
    } else if t >= t0 {
        t0_tilde + (t - t0) * beta_ts
    } else {
        t * beta_th
    };
    let drying_duration = (t - t0).max(0.0) * beta_ts;
    let equivalent_age = if t >= t0 {
        t0_tilde + drying_duration
    } else {
        t * beta_th
    };
    TimeState {
        beta_th,
        beta_ts,
        beta_tc,
        t0_tilde,
        t_prime_hat,
        t_hat,
        drying_duration,
        equivalent_age,
    }
}

pub(crate) struct FinishInput {
    pub t: f64,
    pub t_prime: f64,
    pub humidity: f64,
    pub time: TimeState,
    pub epsilon_sh_inf: f64,
    pub tau_sh: f64,
    pub epsilon_au_inf: f64,
    pub tau_au: f64,
    pub alpha_au: f64,
    pub r_t: f64,
    pub q1: f64,
    pub q2: f64,
    pub q3: f64,
    pub q4: f64,
    pub q5: f64,
    pub p5h: f64,
}

pub(crate) fn finish(input: FinishInput) -> B4Result {
    let kh = if input.humidity <= 0.98 {
        1.0 - input.humidity.powi(3)
    } else {
        12.94 * (1.0 - input.humidity) - 0.2
    };
    let epsilon_sh =
        input.epsilon_sh_inf * kh * (input.time.drying_duration / input.tau_sh).sqrt().tanh();
    let epsilon_au = if input.time.equivalent_age > 0.0 {
        input.epsilon_au_inf
            * (1.0 + (input.tau_au / input.time.equivalent_age).powf(input.alpha_au))
                .powf(input.r_t)
    } else {
        0.0
    };
    let (mut c0, mut cd, mut j) = (0.0, 0.0, 0.0);
    if input.t >= input.t_prime {
        let elapsed = (input.time.t_hat - input.time.t_prime_hat).max(0.0);
        if elapsed > 0.0 {
            let r = 1.7 * input.time.t_prime_hat.powf(0.12) + 8.0;
            let z = input.time.t_prime_hat.powf(-0.5) * (1.0 + elapsed.powf(0.1)).ln();
            let qf = 1.0
                / (0.086 * input.time.t_prime_hat.powf(2.0 / 9.0)
                    + 1.21 * input.time.t_prime_hat.powf(4.0 / 9.0));
            let q = qf * (1.0 + (qf / z).powf(r)).powf(-1.0 / r);
            c0 = input.q2 * q
                + input.q3 * (1.0 + elapsed.powf(0.1)).ln()
                + input.q4 * (input.time.t_hat / input.time.t_prime_hat).ln();
        }
        let start = input.time.t_prime_hat.max(input.time.t0_tilde);
        if input.time.t_hat >= start {
            let h = 1.0
                - (1.0 - input.humidity)
                    * ((input.time.t_hat - input.time.t0_tilde).max(0.0) / input.tau_sh)
                        .sqrt()
                        .tanh();
            let hc = 1.0
                - (1.0 - input.humidity)
                    * ((start - input.time.t0_tilde).max(0.0) / input.tau_sh)
                        .sqrt()
                        .tanh();
            cd = input.q5
                * ((-input.p5h * h).exp() - (-input.p5h * hc).exp())
                    .max(0.0)
                    .sqrt();
        }
        j = input.q1 + input.time.beta_tc * c0 + cd;
    }
    B4Result {
        t: input.t,
        j,
        j_gpa: j * 1000.0,
        c0,
        cd,
        epsilon_sh,
        epsilon_au,
        epsilon_total: epsilon_sh + epsilon_au,
    }
}

#[derive(Clone, Copy)]
struct AdmixtureFactors {
    tau_cem: f64,
    epsilon_au_cem: f64,
    r_eps_w: f64,
    r_alpha: f64,
    p2: f64,
    p3: f64,
    p4: f64,
    p5: f64,
}

fn admixture_factors(params: &B4Params) -> Result<AdmixtureFactors, String> {
    let values = [
        params.retarder,
        params.fly_ash,
        params.superplasticizer,
        params.silica_fume,
        params.air_entraining_agent,
        params.water_reducer,
    ];
    if values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0)
    {
        return Err("B4 admixture percentages must be finite and non-negative.".into());
    }
    let (re, fly, sup, silica, aea, wr) = (
        values[0], values[1], values[2], values[3], values[4], values[5],
    );
    let shrinkage = if re > 0.0 {
        if re <= 0.5 && fly < 15.0 {
            [6.0, 0.58, 0.5, 2.6]
        } else if re <= 0.6 && fly <= 15.0 {
            [2.0, 0.43, 0.59, 3.1]
        } else if re <= 0.6 && fly <= 30.0 {
            [2.1, 0.72, 0.88, 3.4]
        } else if re <= 0.6 {
            [2.8, 0.87, 1.6, 5.0]
        } else if fly <= 15.0 {
            [2.0, 0.26, 0.22, 0.95]
        } else if fly <= 30.0 {
            [2.1, 1.1, 1.1, 3.3]
        } else {
            [2.1, 1.1, 0.97, 4.0]
        }
    } else if fly > 0.0 {
        if fly <= 15.0 && sup <= 5.0 {
            [0.32, 0.71, 0.55, 1.71]
        } else if fly <= 15.0 {
            [0.32, 0.55, 0.92, 2.3]
        } else if fly <= 30.0 && sup <= 5.0 {
            [0.5, 0.9, 0.82, 1.25]
        } else if fly <= 30.0 {
            [0.5, 0.8, 0.8, 2.81]
        } else if sup <= 5.0 {
            [0.63, 1.38, 0.0, 1.2]
        } else {
            [0.63, 0.95, 0.76, 3.11]
        }
    } else if sup > 0.0 {
        if sup <= 5.0 && silica <= 8.0 {
            [6.0, 2.8, 0.29, 0.21]
        } else if sup <= 5.0 {
            [3.0, 0.96, 0.26, 0.71]
        } else if silica <= 8.0 {
            [8.0, 1.95, 0.0, 1.0]
        } else if silica <= 18.0 {
            [2.6, 0.82, 0.0, 1.2]
        } else {
            [1.0, 1.5, 5.0, 1.0]
        }
    } else if silica > 0.0 {
        if silica <= 8.0 {
            [1.9, 0.47, 0.0, 1.2]
        } else if silica <= 18.0 {
            [2.6, 0.82, 0.0, 1.2]
        } else {
            [1.0, 1.5, 5.0, 1.0]
        }
    } else if aea > 0.0 {
        if aea <= 0.05 {
            [2.3, 1.1, 0.28, 0.35]
        } else {
            [0.44, 4.28, 0.0, 0.36]
        }
    } else if wr > 0.0 {
        if wr <= 2.0 {
            [0.5, 0.38, 0.0, 1.9]
        } else if wr <= 3.0 {
            [6.0, 0.45, 1.51, 0.3]
        } else {
            [2.4, 0.4, 0.68, 1.4]
        }
    } else {
        [1.0; 4]
    };

    let creep = if re > 0.0 {
        if re <= 0.5 && fly < 15.0 {
            [0.31, 7.14, 1.35, 0.48]
        } else {
            [1.43, 0.58, 0.9, 0.46]
        }
    } else if fly > 0.0 {
        if fly >= 15.0 {
            [0.37, 2.33, 0.63, 1.6]
        } else {
            [0.31, 7.14, 1.35, 0.48]
        }
    } else if sup > 0.0 {
        [0.72, 2.19, 1.72, 0.48]
    } else if silica > 0.0 {
        [1.12, 3.11, 0.51, 0.61]
    } else if aea > 0.0 {
        [0.9, 3.17, 1.0, 0.1]
    } else if wr > 0.0 {
        if wr <= 2.0 {
            [1.0, 2.1, 1.68, 0.45]
        } else if wr <= 3.0 {
            [1.41, 0.72, 1.76, 0.6]
        } else {
            [1.28, 2.58, 0.73, 1.1]
        }
    } else {
        [1.0; 4]
    };

    Ok(AdmixtureFactors {
        tau_cem: shrinkage[0],
        epsilon_au_cem: shrinkage[1],
        r_eps_w: shrinkage[2],
        r_alpha: shrinkage[3],
        p2: creep[0],
        p3: creep[1],
        p4: creep[2],
        p5: creep[3],
    })
}

pub fn calculate_b4_point(params: &B4Params, t: f64) -> Result<B4Result, String> {
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
    if !params.c.is_finite() || !(200.0..=1500.0).contains(&params.c) {
        return Err("B4 calibration range is 200 ≤ c ≤ 1500 kg/m³.".into());
    }
    if !params.w_c.is_finite() || !(0.22..=0.87).contains(&params.w_c) {
        return Err("B4 calibration range is 0.22 ≤ w/c ≤ 0.87.".into());
    }
    if !params.a_c.is_finite() || !(1.0..=13.2).contains(&params.a_c) {
        return Err("B4 calibration range is 1 ≤ a/c ≤ 13.2.".into());
    }
    let cement = cement(&params.cement_type)?;
    let aggregate = aggregate(&params.aggregate_type)?;
    let shape = shape(&params.specimen_shape)?;
    let admixture = admixture_factors(params)?;
    let time = time_state(
        params.t0,
        params.t_prime,
        params.t_cur,
        params.t_sh,
        params.t_c,
        t,
    );
    let humidity = normalize_humidity(params.h)?;
    let kh = if humidity <= 0.98 {
        1.0 - humidity.powi(3)
    } else {
        12.94 * (1.0 - humidity) - 0.2
    };
    let tau0 = cement.tau_cem
        * admixture.tau_cem
        * (params.a_c / 6.0).powf(cement.tau_a)
        * (params.w_c / 0.38).powf(cement.tau_w)
        * (6.5 * params.c / 2350.0).powf(cement.tau_c);
    let tau_sh = tau0 * aggregate.0 * (shape * 2.0 * params.v_s).powi(2);
    let epsilon0 = cement.epsilon_cem
        * (params.a_c / 6.0).powf(cement.eps_a)
        * (params.w_c / 0.38).powf(cement.eps_w)
        * (6.5 * params.c / 2350.0).powf(cement.eps_c);
    let e28 = 4734.0 * params.fc.sqrt() / 1000.0;
    let e1_age = 7.0 * time.beta_th + 600.0 * time.beta_ts;
    let e2_age = time.t0_tilde + tau_sh * time.beta_ts;
    let e1 = e28 * (e1_age / (4.0 + (6.0 / 7.0) * e1_age)).sqrt();
    let e2 = e28 * (e2_age / (4.0 + (6.0 / 7.0) * e2_age)).sqrt();
    let epsilon_sh_inf = -epsilon0 * aggregate.1 * e1 / e2;
    let q1 = cement.p1 / (e28 * 1000.0);
    let q2 = cement.p2 * admixture.p2 * (params.w_c / 0.38).powf(cement.p2w) / 1000.0;
    let q3 = cement.p3
        * admixture.p3
        * q2
        * (params.a_c / 6.0).powf(cement.p3a)
        * (params.w_c / 0.38).powf(cement.p3w);
    let q4 = cement.p4
        * admixture.p4
        * (params.a_c / 6.0).powf(cement.p4a)
        * (params.w_c / 0.38).powf(cement.p4w)
        / 1000.0;
    let q5 = cement.p5
        * admixture.p5
        * (params.a_c / 6.0).powf(cement.p5a)
        * (params.w_c / 0.38).powf(cement.p5w)
        * (kh * epsilon_sh_inf).abs().powf(cement.p5e)
        / 1000.0;
    let epsilon_au_inf = -cement.epsilon_au_cem
        * admixture.epsilon_au_cem
        * (params.a_c / 6.0).powf(cement.r_eps_a)
        * (params.w_c / 0.38).powf(cement.r_eps_w * admixture.r_eps_w);
    let tau_au = cement.tau_au_cem * (params.w_c / 0.38).powf(cement.r_tau_w);
    let alpha_au = cement.r_alpha * admixture.r_alpha * params.w_c / 0.38;
    Ok(finish(FinishInput {
        t,
        t_prime: params.t_prime,
        humidity,
        time,
        epsilon_sh_inf,
        tau_sh,
        epsilon_au_inf,
        tau_au,
        alpha_au,
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
pub fn calculate_b4_single(params: &JsValue, t: f64) -> Result<JsValue, JsValue> {
    let params: B4Params = serde_wasm_bindgen::from_value(params.clone())?;
    let result = calculate_b4_point(&params, t).map_err(|error| JsValue::from_str(&error))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn calculate_b4_series(params: &JsValue, max_time: usize) -> Result<JsValue, JsValue> {
    let params: B4Params = serde_wasm_bindgen::from_value(params.clone())?;
    let results: Result<Vec<_>, _> = (0..=max_time)
        .map(|t| calculate_b4_point(&params, t as f64))
        .collect();
    serde_wasm_bindgen::to_value(&results.map_err(|error| JsValue::from_str(&error))?)
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

pub fn calculate_b4_single_internal(params: &B4Params, t: f64) -> Result<B4Result, String> {
    calculate_b4_point(params, t)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn official_case() -> B4Params {
        B4Params {
            t0: 28.0,
            t_prime: 28.0,
            t_cur: 20.0,
            t_sh: 20.0,
            t_c: 20.0,
            h: 50.0,
            fc: 27.6,
            v_s: 19.05,
            c: 219.3,
            w_c: 0.60,
            a_c: 7.0,
            cement_type: "R".into(),
            aggregate_type: "No Information".into(),
            specimen_shape: "1".into(),
            retarder: 0.0,
            fly_ash: 0.0,
            superplasticizer: 0.0,
            silica_fume: 0.0,
            air_entraining_agent: 0.0,
            water_reducer: 0.0,
        }
    }

    #[test]
    fn matches_official_b4_benchmark() {
        let point = calculate_b4_point(&official_case(), 112.0).unwrap();
        assert!((point.j * 1e6 - 169.54).abs() < 0.1);
        assert!((point.c0 * 1e6 - 59.95).abs() < 0.1);
        assert!((point.cd * 1e6 - 81.44).abs() < 0.1);
        assert!((point.epsilon_sh * 1e6 - -434.74).abs() < 0.1);
        assert!((point.epsilon_au * 1e6 - -36.97).abs() < 0.1);
        assert!((point.epsilon_total * 1e6 - -471.71).abs() < 0.1);
    }
}
