//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
//! WebAssembly integration module for the gridless imaging library.
//!
//! This module provides WebAssembly-specific functionality including:
//! - JavaScript bindings for core imaging functions
//! - SIMD-optimized utilities for WebAssembly targets
//! - Helper functions for data conversion and caching
//! - Performance-optimized color mapping and coordinate transformations
//!
//! The module is organized into several submodules:
//! - `bindings`: Main WebAssembly function exports for JavaScript
//! - `utils`: WASM-specific utility functions and caching
//! - `simd_utils`: SIMD-optimized functions for WebAssembly targets

pub mod bindings;
pub mod cache;
pub mod gridless_simd;
pub mod img_simd;
pub mod simd_utils;
pub mod sphere_plot_simd;
pub mod sphere_simd;
pub mod tart_obs_simd;
pub mod utils;

// Re-export main WASM functions for easy access
// Re-export main WASM functions for easy access
pub use bindings::{
    get_color_bytes_only, get_color_bytes_only_simd, get_pixel_coords_only_simd, json_to_svg,
    json_to_svg_with_features,
};

// Cache management
pub use cache::{clear_hemisphere_cache, get_or_create_hemisphere};

// Utility functions
pub use utils::datetime_to_js_timestamp;

// SIMD optimization modules
pub use gridless_simd::reconstruct_sky_image_simd;
pub use img_simd::{get_uvw_optimized, get_uvw_simd};
pub use simd_utils::{
    f32x4_splat, i32x4_splat, simd_color_mapping, simd_find_min_max, simd_transform_corners,
};
pub use sphere_plot_simd::{
    format_coords_optimized, normalize_colors_optimized, process_hemisphere_pixels_optimized,
    transform_coordinates_optimized,
};
pub use sphere_simd::{compute_hemisphere_optimized, compute_hemisphere_simd};
pub use tart_obs_simd::apply_gains_optimized;
