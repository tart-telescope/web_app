//! # Gridless Radio Astronomy Imaging Library
//!
//! Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//!
//! This library provides efficient gridless deconvolution algorithms for radio astronomy imaging,
//! with optional WebAssembly SIMD optimizations for enhanced performance.
//!
//! ## SIMD Optimizations
//!
//! When compiled with the `simd` feature and targeting WebAssembly, this library uses SIMD
//! instructions to accelerate:
//! - Min/max finding operations (2x f32 values per instruction)
//! - Normalization calculations
//! - Color mapping operations
//!
//! ### Usage Example
//! ```rust,no_run
//! use gridlesslib::get_color_bytes_only_simd;
//! use wasm_bindgen::JsValue;
//!
//! // Standard version
//! let result1 = get_color_bytes_only(json_data.clone(), 32, true);
//!
//! // SIMD-optimized version (automatically falls back if SIMD unavailable)
//! let result2 = get_color_bytes_only_simd(json_data, 32);
//! ```
//!
//! ### Compilation
//! - Default: `cargo build --target wasm32-unknown-unknown`
//! - With SIMD: `cargo build --target wasm32-unknown-unknown --features simd`
//!
//! https://depth-first.com/articles/2020/07/07/rust-and-webassembly-from-scratch-hello-world-with-strings/
//! TODO switch to the above model of Linear Memory.

extern crate ndarray;
extern crate serde;
extern crate serde_json;

extern crate cdshealpix;
extern crate chrono;
extern crate num;
extern crate rayon;
extern crate serde_derive;

#[cfg(target_arch = "wasm32")]
extern crate wasm_bindgen;
#[cfg(target_arch = "wasm32")]
extern crate web_sys;

pub mod gridless;
mod gridless_core;

pub mod img;

pub mod sphere;
mod sphere_plot;
pub mod tart_api;
mod tart_obs;
pub mod template;
pub mod utils;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

// CLI module only available for binary builds
#[cfg(feature = "cli")]
pub mod cli;

use chrono::{DateTime, Utc};
use thiserror::Error;

#[cfg(not(target_arch = "wasm32"))]
use crate::sphere::Hemisphere;
use crate::tart_api::FullDataset;
use crate::tart_api::Source;
use crate::tart_obs::Observation;
use crate::utils::{VectorComplex, VectorReal};

#[cfg(target_arch = "wasm32")]
pub use wasm::bindings::*;

#[cfg(target_arch = "wasm32")]
use crate::wasm::cache::get_or_create_hemisphere;

#[cfg(not(target_arch = "wasm32"))]
fn get_or_create_hemisphere(nside: u32) -> Hemisphere {
    // Non-WASM targets don't need caching overhead
    Hemisphere::new(nside)
}

/// Configuration for processing radio astronomy data
#[derive(Debug, Clone)]
pub struct ProcessingConfig {
    pub nside: u32,
    pub show_sources: bool,
    pub show_stats: bool,
    pub show_colorbar: bool,
}

/// Processing errors for the library
#[derive(Error, Debug)]
pub enum ProcessingError {
    #[error("Invalid data format: {0}")]
    InvalidFormat(String),

    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Sky reconstruction failed: {0}")]
    ReconstructionError(String),

    #[error("Template rendering failed: {0}")]
    TemplateError(String),
}

pub fn make_svg(
    vis: &VectorComplex,
    u: &VectorReal,
    v: &VectorReal,
    w: &VectorReal,
    nside: u32,
    sources: Option<&Vec<Source>>,
) -> String {
    make_svg_with_features(vis, u, v, w, nside, sources, false, false)
}

pub fn make_svg_with_features(
    vis: &VectorComplex,
    u: &VectorReal,
    v: &VectorReal,
    w: &VectorReal,
    nside: u32,
    sources: Option<&Vec<Source>>,
    show_stats: bool,
    show_colorbar: bool,
) -> String {
    let mut sky = get_or_create_hemisphere(nside);

    match gridless::reconstruct_sky_image(vis, u, v, w, &mut sky, false) {
        Ok(()) => sky
            .to_svg_with_features(true, sources, show_stats, show_colorbar)
            .render_to_string()
            .unwrap_or_else(|e| {
                eprintln!("Template render error: {}", e);
                format!("<!-- Template render error: {} -->", e)
            }),
        Err(e) => {
            eprintln!("Error in sky reconstruction: {}", e);
            sky.to_svg_with_features(true, sources, show_stats, show_colorbar)
                .render_to_string()
                .unwrap_or_else(|render_e| {
                    eprintln!("Template render error: {}", render_e);
                    format!("<!-- Sky reconstruction error: {} -->", e)
                })
        }
    }
}

pub fn json_to_svg(json: &str, nside: u32, show_sources: bool) -> (String, DateTime<Utc>) {
    json_to_svg_with_features(json, nside, show_sources, false, false)
}

pub fn json_to_svg_with_features(
    json: &str,
    nside: u32,
    show_sources: bool,
    show_stats: bool,
    show_colorbar: bool,
) -> (String, DateTime<Utc>) {
    let data = tart_api::json_to_dataset(json);
    let obs = get_obs_from_dataset(&data);

    let (u, v, w) = img::get_uvw(&obs.baselines, &obs.ant_x, &obs.ant_y, &obs.ant_z);

    let sources = if show_sources {
        Some(get_sources_from_dataset(&data))
    } else {
        None
    };

    (
        make_svg_with_features(
            &obs.vis_arr,
            &u,
            &v,
            &w,
            nside,
            sources,
            show_stats,
            show_colorbar,
        ),
        obs.timestamp,
    )
}

/// Main processing function with clean API for CLI
pub fn process_json_data(
    json: &str,
    config: &ProcessingConfig,
) -> Result<(String, DateTime<Utc>), ProcessingError> {
    let data = tart_api::json_to_dataset(json);
    let obs = get_obs_from_dataset(&data);

    let (u, v, w) = img::get_uvw(&obs.baselines, &obs.ant_x, &obs.ant_y, &obs.ant_z);

    let sources = if config.show_sources {
        Some(get_sources_from_dataset(&data))
    } else {
        None
    };

    let svg_data = make_svg_with_features(
        &obs.vis_arr,
        &u,
        &v,
        &w,
        config.nside,
        sources,
        config.show_stats,
        config.show_colorbar,
    );

    Ok((svg_data, obs.timestamp))
}

pub fn file_to_dataset(fname: &str) -> FullDataset {
    tart_api::file_to_dataset(fname)
}

pub fn get_obs_from_dataset(data: &FullDataset) -> Observation {
    tart_obs::get_full(data)
}

pub fn get_sources_from_dataset(data: &FullDataset) -> &Vec<Source> {
    tart_obs::get_sources(data)
}

pub fn get_uvw_from_obs(obs: &Observation) -> (VectorReal, VectorReal, VectorReal) {
    let (u, v, w) = img::get_uvw(&obs.baselines, &obs.ant_x, &obs.ant_y, &obs.ant_z);

    (u, v, w)
}
