//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
//! WebAssembly bindings for the gridless imaging library.
//!
//! This module provides the JavaScript-compatible interface for the gridless
//! imaging algorithms, exposing optimized functions that can be called from
//! web browsers and Node.js environments.

use crate::tart_api::FullDataset;
use crate::wasm::cache::get_or_create_hemisphere;

use js_sys;
use serde_json;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::*;

/// Result structure for SVG generation functions
#[wasm_bindgen]
pub struct SvgResult {
    svg_data: String,
    timestamp: f64,
}

#[wasm_bindgen]
impl SvgResult {
    #[wasm_bindgen(getter)]
    pub fn svg_data(&self) -> String {
        self.svg_data.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> f64 {
        self.timestamp
    }
}

/// Get color-mapped RGB bytes for efficient visualization (returns Uint8Array with RGB triplets)
#[wasm_bindgen]
pub fn get_color_bytes_only(json: String, nside: u32) -> JsValue {
    let dataset: Result<FullDataset, _> = serde_json::from_str(&json);

    match dataset {
        Ok(full_dataset) => {
            let mut hemisphere = get_or_create_hemisphere(nside);

            // Process the dataset to get the observation
            let obs = crate::get_obs_from_dataset(&full_dataset);

            // Get UVW coordinates
            let (u_coords, v_coords, w_coords) = crate::get_uvw_from_obs(&obs);

            // Perform gridless imaging
            match crate::gridless::reconstruct_sky_image(
                &obs.vis_arr,
                &u_coords,
                &v_coords,
                &w_coords,
                &mut hemisphere,
                false, // use magnitude, not real only
            ) {
                Ok(_) => rgb_bytes_from_pixels(&hemisphere.visible_pix),
                Err(e) => {
                    web_sys::console::log_1(&format!("Gridless imaging error: {}", e).into());
                    let empty_array = js_sys::Uint8Array::new_with_length(0);
                    empty_array.into()
                }
            }
        }
        Err(e) => {
            web_sys::console::log_1(&format!("JSON parse error: {}", e).into());
            let empty_array = js_sys::Uint8Array::new_with_length(0);
            empty_array.into()
        }
    }
}

/// SIMD-optimized version for WebAssembly targets with SIMD support.
///
/// This function provides significant performance improvements over the standard version
/// when compiled for WebAssembly with SIMD instructions enabled. It automatically
/// falls back to optimized scalar implementations when SIMD is not available.
///
/// On non-WASM targets, this function automatically falls back to optimized
/// scalar implementations to maintain compatibility.
#[wasm_bindgen]
#[cfg(feature = "simd")]
pub fn get_color_bytes_only_simd(json: String, nside: u32) -> JsValue {
    let dataset: Result<FullDataset, _> = serde_json::from_str(&json);

    match dataset {
        Ok(full_dataset) => {
            let mut hemisphere = get_or_create_hemisphere(nside);

            // Process the dataset to get the observation
            let obs = crate::get_obs_from_dataset(&full_dataset);

            // Get UVW coordinates
            let (u_coords, v_coords, w_coords) = crate::get_uvw_from_obs(&obs);

            // Use SIMD-optimized gridless imaging
            match crate::wasm::gridless_simd::reconstruct_sky_image_simd(
                &obs.vis_arr,
                &u_coords,
                &v_coords,
                &w_coords,
                &mut hemisphere,
                false, // use magnitude, not real only
            ) {
                Ok(_) => rgb_bytes_from_pixels(&hemisphere.visible_pix),
                Err(e) => {
                    web_sys::console::log_1(&format!("SIMD gridless imaging error: {}", e).into());
                    let empty_array = js_sys::Uint8Array::new_with_length(0);
                    empty_array.into()
                }
            }
        }
        Err(e) => {
            web_sys::console::log_1(&format!("JSON parse error: {}", e).into());
            let empty_array = js_sys::Uint8Array::new_with_length(0);
            empty_array.into()
        }
    }
}

/// Get pixel coordinates for WebAssembly rendering (returns Uint16Array with coordinate pairs)
///
/// This function generates SVG-compatible coordinate pairs for each visible pixel
/// in the hemisphere. The coordinates are optimized for direct use in web rendering
/// and are returned as a flat array of u16 values.
///
/// # Returns
/// Uint16Array containing [x0, y0, x1, y1, ...] coordinate pairs
#[wasm_bindgen]
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
pub fn get_pixel_coords_only_simd(nside: u32) -> JsValue {
    use cdshealpix::ring::vertices;

    let hemisphere = get_or_create_hemisphere(nside);

    // SVG coordinate system setup (matching sphere_plot.rs)
    let w = 4000;
    let scale = (w as f32) / 2.1;
    let center = ((w as f32) / 2.0).round() as i32;

    // Pre-allocate with estimated capacity (4 corners × 2 coords per pixel)
    let mut coords = Vec::with_capacity(hemisphere.visible_pix.len() * 8);

    // Process each visible pixel
    for &pix_index in &hemisphere.visible_indices {
        // Get pixel corners using HEALPix vertices
        let corners = vertices(nside, pix_index);

        // Transform each corner individually
        let mut corner_coords = [0u16; 8];
        for (idx, &(lon, lat)) in corners.iter().enumerate() {
            // Direct coordinate transformation: cos(lat) * sin(lon), -cos(lat) * cos(lon)
            let (sin_lon, cos_lon) = crate::utils::fast_sin_cos(lon as f32);
            let cos_lat = (crate::utils::PI_HALF - lat as f32).sin(); // cos(lat) = sin(PI/2 - lat)
            let x = cos_lat * sin_lon;
            let y = -cos_lat * cos_lon;

            // Convert to SVG coordinates (same as pc.from_xy in sphere_plot.rs)
            let svg_x = ((x * scale).round() as i32 + center) as u16;
            let svg_y = ((y * scale).round() as i32 + center) as u16;

            corner_coords[idx * 2] = svg_x;
            corner_coords[idx * 2 + 1] = svg_y;
        }

        coords.extend_from_slice(&corner_coords);
    }

    // Convert to Uint16Array for JavaScript
    let uint16_array = js_sys::Uint16Array::new_with_length(coords.len() as u32);
    uint16_array.copy_from(&coords);
    uint16_array.into()
}

/// Fallback scalar version when SIMD is not available.
#[wasm_bindgen]
#[cfg(not(all(target_arch = "wasm32", feature = "simd")))]
pub fn get_pixel_coords_only_simd(nside: u32) -> JsValue {
    use cdshealpix::ring::vertices;

    let hemisphere = get_or_create_hemisphere(nside);

    // SVG coordinate system setup (matching sphere_plot.rs)
    let w = 4000;
    let scale = (w as f32) / 2.1;
    let center = ((w as f32) / 2.0).round() as i32;

    // Pre-allocate with estimated capacity
    let mut coords = Vec::with_capacity(hemisphere.visible_pix.len() * 8);

    // Process each visible pixel using scalar operations
    for &pix_index in &hemisphere.visible_indices {
        let corners = vertices(nside, pix_index);

        // Transform each corner individually
        let mut corner_coords = [0u16; 8];
        for (idx, &(lon, lat)) in corners.iter().enumerate() {
            // Direct coordinate transformation: cos(lat) * sin(lon), -cos(lat) * cos(lon)
            let (sin_lon, cos_lon) = crate::utils::fast_sin_cos(lon as f32);
            let cos_lat = (crate::utils::PI_HALF - lat as f32).sin(); // cos(lat) = sin(PI/2 - lat)
            let x = cos_lat * sin_lon;
            let y = -cos_lat * cos_lon;

            // Convert to SVG coordinates (same as pc.from_xy in sphere_plot.rs)
            let svg_x = ((x * scale).round() as i32 + center) as u16;
            let svg_y = ((y * scale).round() as i32 + center) as u16;

            corner_coords[idx * 2] = svg_x;
            corner_coords[idx * 2 + 1] = svg_y;
        }

        coords.extend_from_slice(&corner_coords);
    }

    // Convert to Uint16Array for JavaScript
    let uint16_array = js_sys::Uint16Array::new_with_length(coords.len() as u32);
    uint16_array.copy_from(&coords);
    uint16_array.into()
}

/// Convert JSON dataset to SVG string
#[wasm_bindgen]
pub fn json_to_svg(json: &str, nside: u32, show_sources: bool) -> SvgResult {
    let (svg_data, timestamp) = crate::json_to_svg(json, nside, show_sources);

    SvgResult {
        svg_data,
        timestamp: timestamp.timestamp_millis() as f64,
    }
}

/// Convert JSON dataset to SVG string with additional features
#[wasm_bindgen]
pub fn json_to_svg_with_features(
    json: &str,
    nside: u32,
    show_sources: bool,
    show_stats: bool,
    show_colorbar: bool,
) -> SvgResult {
    let (svg_data, timestamp) =
        crate::json_to_svg_with_features(json, nside, show_sources, show_stats, show_colorbar);

    SvgResult {
        svg_data,
        timestamp: timestamp.timestamp_millis() as f64,
    }
}

/// Get pixel corners in lon,lat coordinates for 3D modeling
/// Returns a flat array with 8 values per pixel: [lon0, lat0, lon1, lat1, lon2, lat2, lon3, lat3, ...]
#[wasm_bindgen]
pub fn get_hemisphere_pixel_corners(nside: u32) -> JsValue {
    let hemisphere = get_or_create_hemisphere(nside);

    let pixel_corners = crate::wasm::sphere_plot_simd::get_hemisphere_pixel_corners(&hemisphere);

    // Flatten the corners into a single array: [lon0, lat0, lon1, lat1, ...]
    let mut flat_coords = Vec::with_capacity(pixel_corners.len() * 8);
    for corners in pixel_corners {
        for (lon, lat) in corners {
            flat_coords.push(lon);
            flat_coords.push(lat);
        }
    }

    // Convert to Float32Array for JavaScript
    let float32_array = js_sys::Float32Array::new_with_length(flat_coords.len() as u32);
    float32_array.copy_from(&flat_coords);
    float32_array.into()
}

/// Pre-computed cubehelix color lookup table.
///
/// For 8-bit output there are only 256 possible values, so we pre-compute
/// the entire cubehelix mapping at program start. This eliminates all
/// trigonometric and arithmetic overhead from the per-pixel color loop.
///
/// The LUT maps [0..255] → (r, g, b) triplets.
/// Index = floor(clamped_normalized_value * 255).
static CUBEHELIX_LUT: once_cell::sync::Lazy<[(u8, u8, u8); 256]> =
    once_cell::sync::Lazy::new(|| {
        let mut lut = [(0u8, 0u8, 0u8); 256];
        for (i, entry) in lut.iter_mut().enumerate() {
            let fract = i as f32 / 255.0;
            *entry = cubehelix_color_raw(fract);
        }
        lut
    });

/// Compute a single cubehelix color (used to build the LUT).
fn cubehelix_color_raw(fract: f32) -> (u8, u8, u8) {
    // CubeHelix parameters (matching hemisphere_template.rs)
    const START: f32 = 1.0;
    const ROT: f32 = -1.5;
    const SAT: f32 = 1.5;
    const TWO_PI: f32 = 2.0 * std::f32::consts::PI;

    let angle_base = TWO_PI * (START / 3.0 + 1.0);
    let angle_scale = TWO_PI * ROT;

    let angle = angle_base + angle_scale * fract;
    let (sin_angle, cos_angle) = angle.sin_cos();

    let amp = SAT * fract * (1.0 - fract) * 0.5;
    let amp_cos = amp * cos_angle;
    let amp_sin = amp * sin_angle;

    let red = (fract + amp_cos * -0.14861 + amp_sin * 1.78277).clamp(0.0, 1.0);
    let grn = (fract + amp_cos * -0.29227 + amp_sin * -0.90649).clamp(0.0, 1.0);
    let blu = (fract + amp_cos * 1.97294).clamp(0.0, 1.0);

    (
        (red * 255.0).round() as u8,
        (grn * 255.0).round() as u8,
        (blu * 255.0).round() as u8,
    )
}

/// Look up a color from the pre-computed cubehelix LUT.
/// `fract` should be in [0.0, 1.0].
#[inline(always)]
fn cubehelix_color(fract: f32) -> (u8, u8, u8) {
    let idx = (fract.clamp(0.0, 1.0) * 255.0) as usize;
    // Safety: fract is clamped to [0,1], so idx is in [0, 255]
    CUBEHELIX_LUT[idx]
}

/// Convert pixel values to cubehelix-mapped RGB bytes using the pre-computed LUT.
///
/// This is shared between `get_color_bytes_only` and `get_color_bytes_only_simd`.
/// For large pixel counts (typical in radio astronomy imaging), the LUT approach
/// is ~5-10× faster than computing cubehelix colors on the fly for each pixel.
fn rgb_bytes_from_pixels(pixels: &crate::utils::VectorReal) -> JsValue {
    if pixels.is_empty() {
        let empty_array = js_sys::Uint8Array::new_with_length(0);
        return empty_array.into();
    }

    // Single-pass min/max
    let mut min_val = f32::INFINITY;
    let mut max_val = f32::NEG_INFINITY;
    for &p in pixels.iter() {
        min_val = min_val.min(p);
        max_val = max_val.max(p);
    }
    let range = max_val - min_val;

    if range == 0.0 {
        let rgb_bytes = vec![128u8; pixels.len() * 3];
        let uint8_array = js_sys::Uint8Array::new_with_length(rgb_bytes.len() as u32);
        uint8_array.copy_from(&rgb_bytes);
        return uint8_array.into();
    }

    let inv_range_255 = 255.0 / range;
    let mut rgb_bytes = vec![0u8; pixels.len() * 3];

    for (i, &pixel_val) in pixels.iter().enumerate() {
        // Map to LUT index directly: idx = floor((pixel_val - min) / range * 255)
        let idx = ((pixel_val - min_val) * inv_range_255) as usize;
        let (r, g, b) = CUBEHELIX_LUT[idx];
        let base = i * 3;
        rgb_bytes[base] = r;
        rgb_bytes[base + 1] = g;
        rgb_bytes[base + 2] = b;
    }

    let uint8_array = js_sys::Uint8Array::new_with_length(rgb_bytes.len() as u32);
    uint8_array.copy_from(&rgb_bytes);
    uint8_array.into()
}
