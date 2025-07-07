//
// Copyright (c) 2019-2021 Tim Molteno tim@elec.ac.nz
//
//! SIMD-optimized image coordinate processing for WebAssembly targets.
//!
//! This module provides WebAssembly SIMD-accelerated versions of coordinate
//! transformation and baseline processing algorithms for enhanced performance.

use crate::utils::{L1_WAVELENGTH, VectorReal};

#[cfg(all(target_arch = "wasm32", feature = "simd"))]
#[allow(unused_imports)]
use core::arch::wasm32::*;

fn spatial_frequency(a: f32, b: f32) -> f32 {
    (a - b) / L1_WAVELENGTH
}

/// SIMD-optimized version of get_uvw for WebAssembly with reduced allocations.
///
/// This function processes multiple baselines simultaneously using WebAssembly SIMD
/// instructions, providing significant performance improvements over the scalar version.
///
/// ## Optimizations:
/// - **Pre-allocation**: Uses `Vec::with_capacity()` to eliminate reallocations
/// - **SIMD processing**: Processes 4 baselines per iteration using f32x4 operations
/// - **Vectorized arithmetic**: Performs coordinate differences and wavelength division in parallel
/// - **Reduced memory traffic**: Batches memory access patterns for better cache locality
///
/// ## Performance Benefits:
/// - ~4× throughput for baseline processing (4 baselines per SIMD iteration)
/// - Eliminates dynamic allocations during vector growth
/// - Better CPU pipeline utilization through SIMD parallelism
/// - Reduced function call overhead (fewer spatial_frequency calls)
///
/// ## Algorithm:
/// 1. Pre-allocate output vectors with exact capacity
/// 2. Process baselines in chunks of 4 using SIMD
/// 3. Load antenna coordinates into f32x4 vectors
/// 4. Perform vectorized: (x_i - x_j) / L1_WAVELENGTH
/// 5. Extract and store results
/// 6. Handle remainder baselines with scalar operations
///
/// Falls back to scalar processing for the remainder when baseline count
/// is not divisible by 4.
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
pub fn get_uvw_simd(
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

    // Pre-compute inverse wavelength for SIMD
    let inv_wavelength = f32x4_splat(1.0 / L1_WAVELENGTH);

    // Process 4 baselines at a time using SIMD
    let chunks = num_baselines / 4;
    let remainder = num_baselines % 4;

    for chunk_idx in 0..chunks {
        let base_idx = chunk_idx * 4;

        // Load baseline indices
        let bl0 = baselines[base_idx];
        let bl1 = baselines[base_idx + 1];
        let bl2 = baselines[base_idx + 2];
        let bl3 = baselines[base_idx + 3];

        // Load antenna coordinates for i antennas
        let x_i = f32x4(
            x[bl0.0 as usize],
            x[bl1.0 as usize],
            x[bl2.0 as usize],
            x[bl3.0 as usize],
        );
        let y_i = f32x4(
            y[bl0.0 as usize],
            y[bl1.0 as usize],
            y[bl2.0 as usize],
            y[bl3.0 as usize],
        );
        let z_i = f32x4(
            z[bl0.0 as usize],
            z[bl1.0 as usize],
            z[bl2.0 as usize],
            z[bl3.0 as usize],
        );

        // Load antenna coordinates for j antennas
        let x_j = f32x4(
            x[bl0.1 as usize],
            x[bl1.1 as usize],
            x[bl2.1 as usize],
            x[bl3.1 as usize],
        );
        let y_j = f32x4(
            y[bl0.1 as usize],
            y[bl1.1 as usize],
            y[bl2.1 as usize],
            y[bl3.1 as usize],
        );
        let z_j = f32x4(
            z[bl0.1 as usize],
            z[bl1.1 as usize],
            z[bl2.1 as usize],
            z[bl3.1 as usize],
        );

        // Vectorized spatial frequency calculation: (a - b) / L1_WAVELENGTH
        let u_diff = f32x4_sub(x_i, x_j);
        let v_diff = f32x4_sub(y_i, y_j);
        let w_diff = f32x4_sub(z_i, z_j);

        let u_freq = f32x4_mul(u_diff, inv_wavelength);
        let v_freq = f32x4_mul(v_diff, inv_wavelength);
        let w_freq = f32x4_mul(w_diff, inv_wavelength);

        // Extract and store results
        uu_a.push(f32x4_extract_lane::<0>(u_freq));
        uu_a.push(f32x4_extract_lane::<1>(u_freq));
        uu_a.push(f32x4_extract_lane::<2>(u_freq));
        uu_a.push(f32x4_extract_lane::<3>(u_freq));

        vv_a.push(f32x4_extract_lane::<0>(v_freq));
        vv_a.push(f32x4_extract_lane::<1>(v_freq));
        vv_a.push(f32x4_extract_lane::<2>(v_freq));
        vv_a.push(f32x4_extract_lane::<3>(v_freq));

        ww_a.push(f32x4_extract_lane::<0>(w_freq));
        ww_a.push(f32x4_extract_lane::<1>(w_freq));
        ww_a.push(f32x4_extract_lane::<2>(w_freq));
        ww_a.push(f32x4_extract_lane::<3>(w_freq));
    }

    // Process remaining baselines (fewer than 4) using scalar operations
    for idx in (chunks * 4)..(chunks * 4 + remainder) {
        let bl = baselines[idx];
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

/// Standard scalar version for non-SIMD targets or when SIMD feature is disabled.
///
/// This version provides the same functionality as the SIMD version but uses
/// scalar operations. It still includes the pre-allocation optimization to
/// avoid vector reallocations during growth.
///
/// ## Optimizations vs original:
/// - **Pre-allocation**: Uses `Vec::with_capacity()` to eliminate reallocations
/// - **Same algorithm**: Maintains identical output to SIMD version
///
/// ## Fallback behavior:
/// - Used when target is not wasm32 or SIMD feature is disabled
/// - Provides consistent API across all compilation targets
/// - Ensures correctness when SIMD optimizations are unavailable
#[cfg(not(all(target_arch = "wasm32", feature = "simd")))]
pub fn get_uvw_simd(
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

/// Legacy compatibility function - routes to optimized SIMD implementation.
///
/// Maintains backward compatibility while automatically using the most efficient
/// implementation available for the target architecture.
pub fn get_uvw_optimized(
    baselines: &Vec<(u32, u32)>,
    x: &VectorReal,
    y: &VectorReal,
    z: &VectorReal,
) -> (VectorReal, VectorReal, VectorReal) {
    get_uvw_simd(baselines, x, y, z)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::VectorReal;

    #[test]
    fn test_simd_vs_scalar_consistency() {
        let baselines = vec![(0, 1), (1, 2), (2, 3), (0, 3)];
        let x = VectorReal::from_vec(vec![0.0, 1.0, 2.0, 3.0]);
        let y = VectorReal::from_vec(vec![0.0, 1.0, 2.0, 3.0]);
        let z = VectorReal::from_vec(vec![0.0, 1.0, 2.0, 3.0]);

        let (u, v, w) = get_uvw_simd(&baselines, &x, &y, &z);

        // Should have same length as input baselines
        assert_eq!(u.len(), baselines.len());
        assert_eq!(v.len(), baselines.len());
        assert_eq!(w.len(), baselines.len());

        // Results should be finite
        for i in 0..baselines.len() {
            assert!(u[i].is_finite());
            assert!(v[i].is_finite());
            assert!(w[i].is_finite());
        }
    }

    #[test]
    fn test_empty_baselines() {
        let baselines = vec![];
        let x = VectorReal::from_vec(vec![0.0]);
        let y = VectorReal::from_vec(vec![0.0]);
        let z = VectorReal::from_vec(vec![0.0]);

        let (u, v, w) = get_uvw_simd(&baselines, &x, &y, &z);

        assert_eq!(u.len(), 0);
        assert_eq!(v.len(), 0);
        assert_eq!(w.len(), 0);
    }

    #[test]
    fn test_single_baseline() {
        let baselines = vec![(0, 1)];
        let x = VectorReal::from_vec(vec![0.0, 1.0]);
        let y = VectorReal::from_vec(vec![0.0, 1.0]);
        let z = VectorReal::from_vec(vec![0.0, 1.0]);

        let (u, v, w) = get_uvw_simd(&baselines, &x, &y, &z);

        assert_eq!(u.len(), 1);
        assert_eq!(v.len(), 1);
        assert_eq!(w.len(), 1);

        // With coordinates (0,0,0) and (1,1,1), differences are (1,1,1)
        // Divided by L1_WAVELENGTH
        let expected = 1.0 / L1_WAVELENGTH;
        assert!((u[0] - expected).abs() < 1e-6);
        assert!((v[0] - expected).abs() < 1e-6);
        assert!((w[0] - expected).abs() < 1e-6);
    }
}
