use wasm_bindgen::prelude::*;

/// Upper bound for a requested series length.
///
/// The UI only ever asks for 10,000 days. A `usize` arriving from JS is
/// unchecked: a negative number wraps to ~4.3e9, which used to allocate and
/// compute for ~13 s and then abort the wasm instance with
/// `RuntimeError: unreachable` (`max_time + 1` also wraps to 0 for u32::MAX, so
/// the capacity hint did not guard against it either).
pub const MAX_SERIES_POINTS: usize = 200_000;

/// Rejects a series length that would block or trap the wasm instance.
pub fn validate_max_time(max_time: usize) -> Result<(), String> {
    if max_time > MAX_SERIES_POINTS {
        return Err(format!(
            "series length {max_time} is out of range; the maximum is {MAX_SERIES_POINTS} points"
        ));
    }
    Ok(())
}

/// Wraps a validation message in a real JS `Error`.
///
/// The kernels used to throw `JsValue::from_str(...)`, i.e. a bare JS string, so
/// `error.message` was `undefined` in the UI ("Calculation failed: undefined").
/// The explicit return type also keeps `.into()` unambiguous — `js_sys::Error`
/// implements `Into<JsValue>` *and* `Into<Object>`.
pub fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}

/// Performance timer
#[wasm_bindgen]
pub struct PerformanceTimer {
    start_time: f64,
}

#[wasm_bindgen]
impl PerformanceTimer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PerformanceTimer {
        PerformanceTimer {
            start_time: js_sys::Date::now(),
        }
    }

    #[wasm_bindgen]
    pub fn elapsed(&self) -> f64 {
        js_sys::Date::now() - self.start_time
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.start_time = js_sys::Date::now();
    }
}

/// Size of the wasm linear memory in bytes.
///
/// This used to return a hardcoded 1 MiB placeholder while the real instance
/// memory was ~130 MiB, so any caller got a fabricated number.
#[wasm_bindgen]
pub fn get_memory_usage() -> usize {
    linear_memory_bytes()
}

#[cfg(target_arch = "wasm32")]
fn linear_memory_bytes() -> usize {
    // `memory_size` reports pages of 64 KiB.
    core::arch::wasm32::memory_size(0) * 65536
}

#[cfg(not(target_arch = "wasm32"))]
fn linear_memory_bytes() -> usize {
    // The crate is only meaningful as wasm; host builds (unit tests) report 0.
    0
}
