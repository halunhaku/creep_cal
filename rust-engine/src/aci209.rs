use crate::{Aci209CuringType, Aci209Params, TimeSeriesPoint};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

fn loading_age_factor(params: &Aci209Params) -> f64 {
    match params.curing_type {
        Aci209CuringType::Moist if params.t0 <= 7.0 => 1.0,
        Aci209CuringType::Moist => 1.25 * params.t0.powf(-0.118),
        Aci209CuringType::Steam if params.t0 <= 3.0 => 1.0,
        Aci209CuringType::Steam => 1.13 * params.t0.powf(-0.094),
    }
}

fn ultimate_creep(params: &Aci209Params) -> f64 {
    let humidity_factor = if params.h <= 40.0 {
        1.0
    } else {
        1.27 - 0.0067 * params.h
    };
    let size_factor = (2.0 * (1.0 + 1.13 * (-0.0213 * params.vs).exp())) / 3.0;
    let slump_factor = 0.82 + 0.00264 * params.slump;
    let fine_aggregate_factor = 0.88 + 0.0024 * params.fine_aggregate;
    let air_content_factor = (0.46 + 0.09 * params.air_content).max(1.0);

    2.35 * loading_age_factor(params)
        * humidity_factor
        * size_factor
        * slump_factor
        * fine_aggregate_factor
        * air_content_factor
}

/// ACI 209R-92 creep coefficient at concrete age t.
#[wasm_bindgen]
pub fn calculate_aci209_single(params: &JsValue, t: f64) -> Result<f64, JsValue> {
    let params: Aci209Params = serde_wasm_bindgen::from_value(params.clone())?;
    Ok(calculate_aci209_single_internal(&params, t))
}

/// ACI 209R-92 time series indexed by concrete age from casting.
#[wasm_bindgen]
pub fn calculate_aci209_series(params: &JsValue, max_time: usize) -> Result<JsValue, JsValue> {
    let params: Aci209Params = serde_wasm_bindgen::from_value(params.clone())?;
    let phi_infinity = ultimate_creep(&params);
    let mut results = Vec::with_capacity(max_time + 1);

    for t in 0..=max_time {
        let concrete_age = t as f64;
        let elapsed = concrete_age - params.t0;
        let phi = if elapsed <= 0.0 {
            0.0
        } else {
            let elapsed_power = elapsed.powf(0.6);
            elapsed_power / (10.0 + elapsed_power) * phi_infinity
        };
        results.push(TimeSeriesPoint {
            t: concrete_age,
            phi,
        });
    }

    serde_wasm_bindgen::to_value(&results).map_err(|error| JsValue::from_str(&error.to_string()))
}

/// ACI 209R-92 batch calculation using the official input units.
#[wasm_bindgen]
pub fn calculate_aci209_batch(batch_data: &JsValue) -> Result<JsValue, JsValue> {
    #[derive(Deserialize, Serialize)]
    struct BatchItem {
        t0: f64,
        #[serde(rename = "H")]
        h: f64,
        #[serde(rename = "VS")]
        vs: f64,
        #[serde(rename = "curingType")]
        curing_type: Aci209CuringType,
        slump: f64,
        #[serde(rename = "fineAggregate")]
        fine_aggregate: f64,
        #[serde(rename = "airContent")]
        air_content: f64,
        t: f64,
    }

    #[derive(Serialize)]
    struct BatchResult {
        phi: f64,
        #[serde(flatten)]
        original: serde_json::Value,
    }

    let batch: Vec<BatchItem> = serde_wasm_bindgen::from_value(batch_data.clone())?;
    let results: Vec<BatchResult> = batch
        .into_iter()
        .map(|item| {
            let params = Aci209Params {
                t0: item.t0,
                h: item.h,
                vs: item.vs,
                curing_type: item.curing_type,
                slump: item.slump,
                fine_aggregate: item.fine_aggregate,
                air_content: item.air_content,
            };
            BatchResult {
                phi: calculate_aci209_single_internal(&params, item.t),
                original: serde_json::to_value(&item).expect("serializing a valid batch item"),
            }
        })
        .collect();

    serde_wasm_bindgen::to_value(&results).map_err(|error| JsValue::from_str(&error.to_string()))
}

pub fn calculate_aci209_single_internal(params: &Aci209Params, t: f64) -> f64 {
    let elapsed = t - params.t0;
    if elapsed <= 0.0 {
        return 0.0;
    }

    let elapsed_power = elapsed.powf(0.6);
    elapsed_power / (10.0 + elapsed_power) * ultimate_creep(params)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn standard_params() -> Aci209Params {
        Aci209Params {
            t0: 7.0,
            h: 40.0,
            vs: -(0.5_f64 / 1.13).ln() / 0.0213,
            curing_type: Aci209CuringType::Moist,
            slump: (1.0 - 0.82) / 0.00264,
            fine_aggregate: 50.0,
            air_content: 0.0,
        }
    }

    #[test]
    fn standard_conditions_recover_nominal_ultimate_coefficient() {
        let params = standard_params();
        assert!((ultimate_creep(&params) - 2.35).abs() < 1e-12);
    }

    #[test]
    fn creep_starts_at_loading() {
        let params = standard_params();
        assert_eq!(calculate_aci209_single_internal(&params, 6.0), 0.0);
        assert_eq!(calculate_aci209_single_internal(&params, 7.0), 0.0);
        assert!(calculate_aci209_single_internal(&params, 8.0) > 0.0);
    }
}
