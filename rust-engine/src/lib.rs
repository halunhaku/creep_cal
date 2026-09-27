use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// 导入JavaScript的console.log用于调试
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// 定义宏简化console.log调用
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// 公共数据结构
#[derive(Serialize, Deserialize)]
pub struct TimeSeriesPoint {
    pub t: f64,
    pub phi: f64,
}

#[derive(Serialize, Deserialize)]
pub struct B4Result {
    pub t: f64,
    pub j: f64,
    pub epsilon_sh: f64,
    pub epsilon_au: f64,
}

#[derive(Serialize, Deserialize)]
pub struct B4sResult {
    pub t: f64,
    pub j: f64,
    pub epsilon_sh: f64,
    pub epsilon_au: f64,
}

// ACI 209R-92 creep parameters use the units defined by the report.
#[derive(Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Aci209CuringType {
    Moist,
    Steam,
}

#[derive(Serialize, Deserialize)]
pub struct Aci209Params {
    pub t0: f64,
    #[serde(rename = "H")]
    pub h: f64,
    #[serde(rename = "VS")]
    pub vs: f64,
    #[serde(rename = "curingType")]
    pub curing_type: Aci209CuringType,
    pub slump: f64,
    #[serde(rename = "fineAggregate")]
    pub fine_aggregate: f64,
    #[serde(rename = "airContent")]
    pub air_content: f64,
}

// MC2010模型参数
#[derive(Serialize, Deserialize)]
pub struct Mc2010Params {
    pub fcm: f64,
    pub rh: f64,
    pub t0: f64,
    pub ac: f64,
    pub u: f64,
    pub t: f64,
    pub cement_type: String,
}

// 模块声明
mod aci209;
mod b4;
mod b4s;
mod mc2010;
mod utils;

pub use aci209::*;
pub use b4::*;
pub use b4s::*;
pub use mc2010::*;
pub use utils::*;

// 初始化函数
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("Rust计算引擎已加载");
}

// 性能测试函数
#[wasm_bindgen]
pub fn benchmark_calculation(model: &str, iterations: usize) -> f64 {
    let start = js_sys::Date::now();

    match model {
        "aci209" => {
            for _ in 0..iterations {
                let params = Aci209Params {
                    t0: 28.0,
                    h: 70.0,
                    vs: 100.0,
                    curing_type: Aci209CuringType::Moist,
                    slump: 100.0,
                    fine_aggregate: 50.0,
                    air_content: 8.0,
                };
                // 使用内部函数避免序列化开销
                let _ = aci209::calculate_aci209_single_internal(&params, 365.0);
            }
        }
        _ => console_log!("未知模型: {}", model),
    }

    js_sys::Date::now() - start
}
