//! WebAssembly bindings.
//!
//! A single stateful handle is exported so SGP4 `Constants` are built once per
//! TLE set and reused for every query — building them per call would dominate
//! the runtime. JavaScript owns the network fetch and the TLE cache; this
//! module is pure computation.

use crate::propagation::{self, Propagator, TleRecord};
use serde::Serialize;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::*;

/// One satellite's look angles, shaped to match the catalogue's `/catalog`
/// response so the JavaScript adapter is a pass-through.
#[derive(Serialize)]
struct Row {
    name: String,
    az: f64,
    el: f64,
    /// Range in **metres**, matching the server's `r` field (the crate's
    /// internal math is in km).
    r: f64,
    jy: f64,
}

fn rows(got: Vec<propagation::SatelliteHorizontal>) -> Vec<Row> {
    got.into_iter()
        .map(|s| Row {
            name: s.name,
            az: s.az_deg,
            el: s.el_deg,
            r: s.range_km * 1000.0,
            jy: s.jy,
        })
        .collect()
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// A parsed TLE set with propagators ready for repeated queries.
#[wasm_bindgen]
pub struct CataloguePropagators {
    propagators: Vec<Propagator>,
    skipped: usize,
}

#[wasm_bindgen]
impl CataloguePropagators {
    /// Build from the JSON array returned by `/ephemerides`
    /// (`[{name, line1, line2, jy}, ...]`).
    ///
    /// Malformed individual TLEs are skipped rather than failing the set, so
    /// one bad record cannot blank the sky. Throws only if the JSON itself is
    /// unparseable or contains no usable TLE.
    #[wasm_bindgen(constructor)]
    pub fn new(tles_json: &str) -> Result<CataloguePropagators, JsValue> {
        let records: Vec<TleRecord> = serde_json::from_str(tles_json)
            .map_err(|e| JsValue::from_str(&format!("invalid TLE JSON: {e}")))?;

        let (propagators, skipped) = propagation::build_propagators(&records);

        if propagators.is_empty() {
            return Err(JsValue::from_str("no usable TLEs in the supplied set"));
        }

        Ok(Self {
            propagators,
            skipped,
        })
    }

    /// Horizontal positions for every satellite at one instant.
    ///
    /// `unix_secs` is fractional unix epoch seconds. `min_el_deg` filters
    /// in the same loop, matching the server, which defaults to 0.0.
    pub fn horizontal_positions(
        &self,
        unix_secs: f64,
        lat_deg: f64,
        lon_deg: f64,
        alt_m: f64,
        min_el_deg: f64,
    ) -> Result<JsValue, JsValue> {
        let got = propagation::horizontal_positions_at(
            &self.propagators,
            unix_secs,
            lat_deg,
            lon_deg,
            alt_m,
            min_el_deg,
        );
        to_js(&rows(got))
    }

    /// Horizontal positions for every satellite at many instants.
    /// Returns one array of rows per input instant.
    pub fn horizontal_positions_bulk(
        &self,
        unix_secs: &[f64],
        lat_deg: f64,
        lon_deg: f64,
        alt_m: f64,
        min_el_deg: f64,
    ) -> Result<JsValue, JsValue> {
        let got = propagation::horizontal_positions_bulk(
            &self.propagators,
            unix_secs,
            lat_deg,
            lon_deg,
            alt_m,
            min_el_deg,
        );
        let out: Vec<Vec<Row>> = got.into_iter().map(rows).collect();
        to_js(&out)
    }

    /// Number of usable propagators in this set.
    #[wasm_bindgen(getter)]
    pub fn count(&self) -> usize {
        self.propagators.len()
    }

    /// Number of TLEs that failed to parse and were skipped.
    #[wasm_bindgen(getter)]
    pub fn skipped(&self) -> usize {
        self.skipped
    }
}

/// Crate version, for diagnostics.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
