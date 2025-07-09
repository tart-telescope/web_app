//
// Copyright (c) 2019-2021 Tim Molteno tim@elec.ac.nz
//
#[cfg(not(target_arch = "wasm32"))]
use crate::utils::L1_WAVELENGTH;
use crate::utils::VectorReal;

#[cfg(target_arch = "wasm32")]
use crate::wasm::img_simd;

#[cfg(not(target_arch = "wasm32"))]
fn spatial_frequency(a: f32, b: f32) -> f32 {
    (a - b) / L1_WAVELENGTH
}

/// Optimized UVW coordinate calculation with automatic SIMD usage.
///
/// Calculates UVW coordinates from baseline and antenna position data.
/// Automatically uses SIMD optimizations when targeting WebAssembly,
/// falls back to scalar processing otherwise.
///
/// Delegates to the appropriate implementation in the `wasm::img_simd` module
/// when WASM target is detected, otherwise uses scalar processing.
#[cfg(target_arch = "wasm32")]
pub fn get_uvw(
    baselines: &Vec<(u32, u32)>,
    x: &VectorReal,
    y: &VectorReal,
    z: &VectorReal,
) -> (VectorReal, VectorReal, VectorReal) {
    img_simd::get_uvw_optimized(baselines, x, y, z)
}

/// Standard scalar version for non-WASM targets.
///
/// Uses scalar operations with pre-allocation optimization for good performance
/// on non-WebAssembly targets where SIMD optimizations aren't available.
#[cfg(not(target_arch = "wasm32"))]
pub fn get_uvw(
    baselines: &Vec<(u32, u32)>,
    x: &VectorReal,
    y: &VectorReal,
    z: &VectorReal,
) -> (VectorReal, VectorReal, VectorReal) {
    let num_baselines = baselines.len();

    // Pre-allocate with exact capacity to avoid reallocations
    let mut uu_a = Vec::with_capacity(num_baselines);
    let mut vv_a = Vec::with_capacity(num_baselines);
    let mut ww_a = Vec::with_capacity(num_baselines);

    for bl in baselines {
        let i = bl.0 as usize;
        let j = bl.1 as usize;
        uu_a.push(spatial_frequency(x[i], x[j]));
        vv_a.push(spatial_frequency(y[i], y[j]));
        ww_a.push(spatial_frequency(z[i], z[j]));
    }
    (
        VectorReal::from_vec(uu_a),
        VectorReal::from_vec(vv_a),
        VectorReal::from_vec(ww_a),
    )
}
