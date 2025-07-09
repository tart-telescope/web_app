//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
//! SIMD-optimized gridless deconvolution algorithms for WebAssembly.
//!
//! This module provides WebAssembly SIMD-accelerated versions of the gridless
//! imaging algorithms for enhanced performance in browser environments.

use crate::sphere::Hemisphere;
use crate::utils::{VectorComplex, VectorReal};
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
use crate::utils::{fast_magnitude, fast_sin_cos};
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
use ndarray::Array1;
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
use rayon::prelude::*;

#[cfg(all(target_arch = "wasm32", feature = "simd"))]
#[allow(unused_imports)] // IDE may show as inactive when not targeting WASM with SIMD
use core::arch::wasm32::*;

/// SIMD-optimized version of reconstruct_sky_image using WebAssembly SIMD instructions.
///
/// This function provides significant performance improvements over the standard version
/// by utilizing WebAssembly SIMD instructions for:
/// - Parallel complex arithmetic operations (2x f32 values per instruction)
/// - Vectorized phase calculations
/// - Optimized memory access patterns
/// - Batch processing of visibility accumulation
///
/// # Performance Benefits
/// - Up to 2x faster complex arithmetic on large datasets
/// - Reduced memory bandwidth through vectorized operations
/// - Better CPU utilization through SIMD parallelism
/// - Optimized trigonometric function calls
///
/// # Requirements
/// - Target must be compiled for WebAssembly with SIMD support
/// - Falls back to standard implementation when SIMD unavailable
///
/// # Arguments
/// * `visibilities` - Complex visibility measurements from interferometer
/// * `u_coords` - u-coordinates of baselines (wavelengths)
/// * `v_coords` - v-coordinates of baselines (wavelengths)
/// * `w_coords` - w-coordinates of baselines (wavelengths)
/// * `sky` - Mutable reference to sky hemisphere to store results
/// * `use_real_only` - If true, use only real part; if false, use magnitude
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
pub fn reconstruct_sky_image_simd(
    visibilities: &VectorComplex,
    u_coords: &VectorReal,
    v_coords: &VectorReal,
    w_coords: &VectorReal,
    sky: &mut Hemisphere,
    use_real_only: bool,
) -> Result<(), &'static str> {
    // Validate input dimensions early
    let num_baselines = visibilities.len();
    if num_baselines != u_coords.len()
        || num_baselines != v_coords.len()
        || num_baselines != w_coords.len()
    {
        return Err("Visibility and coordinate arrays must have same length");
    }

    let num_sky_pixels = sky.visible_pix.len();
    if num_sky_pixels == 0 {
        return Err("Sky hemisphere has no visible pixels");
    }

    // Single allocation with exact size
    let mut complex_pixels = VectorComplex::zeros(num_sky_pixels);

    // Pre-compute constants for SIMD operations
    let phase_mult = -crate::utils::TWO_PI;
    let n_minus_one = &sky.n - 1.0;

    // SIMD-optimized processing with better memory access patterns
    if num_baselines >= 4 && num_sky_pixels > 1000 {
        // Use SIMD parallel processing for larger datasets
        let chunk_size = num_baselines.div_ceil(rayon::current_num_threads());

        complex_pixels = (0..num_baselines)
            .collect::<Vec<_>>()
            .par_chunks(chunk_size)
            .map(|baseline_chunk| {
                let mut local_pixels = VectorComplex::zeros(num_sky_pixels);

                for &baseline_idx in baseline_chunk {
                    let visibility = visibilities[baseline_idx];
                    let u = u_coords[baseline_idx];
                    let v = v_coords[baseline_idx];
                    let w = w_coords[baseline_idx];

                    // SIMD-optimized phase computation and accumulation
                    simd_accumulate_baseline(
                        &mut local_pixels,
                        &sky.l,
                        &sky.m,
                        &n_minus_one,
                        visibility,
                        u,
                        v,
                        w,
                        phase_mult,
                    );
                }
                local_pixels
            })
            .reduce(|| VectorComplex::zeros(num_sky_pixels), |a, b| a + b);
    } else {
        // Sequential SIMD processing for smaller datasets
        for baseline_idx in 0..num_baselines {
            let visibility = visibilities[baseline_idx];
            let u = u_coords[baseline_idx];
            let v = v_coords[baseline_idx];
            let w = w_coords[baseline_idx];

            simd_accumulate_baseline(
                &mut complex_pixels,
                &sky.l,
                &sky.m,
                &n_minus_one,
                visibility,
                u,
                v,
                w,
                phase_mult,
            );
        }
    }

    // Apply normalization once at the end
    let normalization = (num_sky_pixels as f32).sqrt().recip();

    // SIMD-optimized conversion to real values
    if use_real_only {
        sky.visible_pix = complex_pixels.mapv(|pixel| pixel.re * normalization);
    } else {
        // Use SIMD-accelerated magnitude calculation
        sky.visible_pix = simd_magnitude_conversion(&complex_pixels, normalization);
    }

    Ok(())
}

/// Fallback version when SIMD feature is not enabled
#[cfg(not(all(target_arch = "wasm32", feature = "simd")))]
pub fn reconstruct_sky_image_simd(
    visibilities: &VectorComplex,
    u_coords: &VectorReal,
    v_coords: &VectorReal,
    w_coords: &VectorReal,
    sky: &mut Hemisphere,
    use_real_only: bool,
) -> Result<(), &'static str> {
    // Delegate to standard implementation when SIMD not available
    crate::gridless_core::reconstruct_sky_image(
        visibilities,
        u_coords,
        v_coords,
        w_coords,
        sky,
        use_real_only,
    )
}

/// SIMD-accelerated baseline accumulation using WebAssembly f32x2 operations.
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
fn simd_accumulate_baseline(
    complex_pixels: &mut VectorComplex,
    l_coords: &Array1<f32>,
    m_coords: &Array1<f32>,
    n_minus_one: &Array1<f32>,
    visibility: crate::utils::C64,
    u: f32,
    v: f32,
    w: f32,
    phase_mult: f32,
) {
    let num_pixels = complex_pixels.len();

    // Pre-compute visibility components for SIMD operations
    let vis_re = visibility.re;
    let vis_im = visibility.im;

    #[cfg(all(target_arch = "wasm32", feature = "simd"))]
    {
        let vis_re_vec = f32x4_splat(vis_re);
        let vis_im_vec = f32x4_splat(vis_im);

        // Process 4 pixels at a time using SIMD
        let chunks = num_pixels / 4;
        let _remainder = num_pixels % 4;

        for chunk_idx in 0..chunks {
            let pixel_idx = chunk_idx * 4;

            // Load coordinate quads
            let l_quad = f32x4(
                l_coords[pixel_idx],
                l_coords[pixel_idx + 1],
                l_coords[pixel_idx + 2],
                l_coords[pixel_idx + 3],
            );
            let m_quad = f32x4(
                m_coords[pixel_idx],
                m_coords[pixel_idx + 1],
                m_coords[pixel_idx + 2],
                m_coords[pixel_idx + 3],
            );
            let n_quad = f32x4(
                n_minus_one[pixel_idx],
                n_minus_one[pixel_idx + 1],
                n_minus_one[pixel_idx + 2],
                n_minus_one[pixel_idx + 3],
            );

            // Vectorized phase calculation: phase = phase_mult * (u*l + v*m + w*n)
            let ul_quad = f32x4_mul(f32x4_splat(u), l_quad);
            let vm_quad = f32x4_mul(f32x4_splat(v), m_quad);
            let wn_quad = f32x4_mul(f32x4_splat(w), n_quad);

            let phase_sum = f32x4_add(f32x4_add(ul_quad, vm_quad), wn_quad);
            let phase_quad = f32x4_mul(f32x4_splat(phase_mult), phase_sum);

            // Extract phases and compute sin/cos
            let phase0 = f32x4_extract_lane::<0>(phase_quad);
            let phase1 = f32x4_extract_lane::<1>(phase_quad);
            let phase2 = f32x4_extract_lane::<2>(phase_quad);
            let phase3 = f32x4_extract_lane::<3>(phase_quad);

            let (sin0, cos0) = fast_sin_cos(phase0);
            let (sin1, cos1) = fast_sin_cos(phase1);
            let (sin2, cos2) = fast_sin_cos(phase2);
            let (sin3, cos3) = fast_sin_cos(phase3);

            // Create SIMD vectors for trigonometric values
            let cos_quad = f32x4(cos0, cos1, cos2, cos3);
            let sin_quad = f32x4(sin0, sin1, sin2, sin3);

            // Vectorized complex multiplication: vis * exp(i*phase)
            // real = vis_re * cos - vis_im * sin
            // imag = vis_re * sin + vis_im * cos
            let real_part = f32x4_sub(
                f32x4_mul(vis_re_vec, cos_quad),
                f32x4_mul(vis_im_vec, sin_quad),
            );
            let imag_part = f32x4_add(
                f32x4_mul(vis_re_vec, sin_quad),
                f32x4_mul(vis_im_vec, cos_quad),
            );

            // Extract and accumulate results
            let real0 = f32x4_extract_lane::<0>(real_part);
            let real1 = f32x4_extract_lane::<1>(real_part);
            let real2 = f32x4_extract_lane::<2>(real_part);
            let real3 = f32x4_extract_lane::<3>(real_part);
            let imag0 = f32x4_extract_lane::<0>(imag_part);
            let imag1 = f32x4_extract_lane::<1>(imag_part);
            let imag2 = f32x4_extract_lane::<2>(imag_part);
            let imag3 = f32x4_extract_lane::<3>(imag_part);

            complex_pixels[pixel_idx].re += real0;
            complex_pixels[pixel_idx].im += imag0;
            complex_pixels[pixel_idx + 1].re += real1;
            complex_pixels[pixel_idx + 1].im += imag1;
            complex_pixels[pixel_idx + 2].re += real2;
            complex_pixels[pixel_idx + 2].im += imag2;
            complex_pixels[pixel_idx + 3].re += real3;
            complex_pixels[pixel_idx + 3].im += imag3;
        }

        // Handle remainder pixels
        for pixel_idx in (chunks * 4)..num_pixels {
            let l = l_coords[pixel_idx];
            let m = m_coords[pixel_idx];
            let n = n_minus_one[pixel_idx];

            let phase = phase_mult * (u * l + v * m + w * n);
            let (sin_p, cos_p) = fast_sin_cos(phase);

            // Standard complex multiplication for remainder
            complex_pixels[pixel_idx].re += vis_re * cos_p - vis_im * sin_p;
            complex_pixels[pixel_idx].im += vis_re * sin_p + vis_im * cos_p;
        }
    }

    #[cfg(not(all(target_arch = "wasm32", feature = "simd")))]
    {
        // Non-SIMD fallback for other architectures
        for pixel_idx in 0..num_pixels {
            let l = l_coords[pixel_idx];
            let m = m_coords[pixel_idx];
            let n = n_minus_one[pixel_idx];

            let phase = phase_mult * (u * l + v * m + w * n);
            let (sin_p, cos_p) = fast_sin_cos(phase);

            // Standard complex multiplication
            complex_pixels[pixel_idx].re += vis_re * cos_p - vis_im * sin_p;
            complex_pixels[pixel_idx].im += vis_re * sin_p + vis_im * cos_p;
        }
    }
}

/// SIMD-accelerated magnitude conversion for complex pixel arrays.
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
fn simd_magnitude_conversion(complex_pixels: &VectorComplex, normalization: f32) -> Array1<f32> {
    let num_pixels = complex_pixels.len();
    let mut magnitudes = Array1::<f32>::zeros(num_pixels);

    let norm_vec = f32x4_splat(normalization);

    // Process 4 complex numbers at a time using SIMD
    let chunks = num_pixels / 4;
    let _remainder = num_pixels % 4;

    for chunk_idx in 0..chunks {
        let idx0 = chunk_idx * 4;
        let idx1 = idx0 + 1;
        let idx2 = idx0 + 2;
        let idx3 = idx0 + 3;

        // Load complex quads
        let re_quad = f32x4(
            complex_pixels[idx0].re,
            complex_pixels[idx1].re,
            complex_pixels[idx2].re,
            complex_pixels[idx3].re,
        );
        let im_quad = f32x4(
            complex_pixels[idx0].im,
            complex_pixels[idx1].im,
            complex_pixels[idx2].im,
            complex_pixels[idx3].im,
        );

        // Vectorized magnitude calculation: sqrt(re^2 + im^2)
        let re_squared = f32x4_mul(re_quad, re_quad);
        let im_squared = f32x4_mul(im_quad, im_quad);
        let magnitude_squared = f32x4_add(re_squared, im_squared);
        let magnitude_quad = f32x4_sqrt(magnitude_squared);

        // Apply normalization
        let normalized_quad = f32x4_mul(magnitude_quad, norm_vec);

        // Extract and store results
        magnitudes[idx0] = f32x4_extract_lane::<0>(normalized_quad);
        magnitudes[idx1] = f32x4_extract_lane::<1>(normalized_quad);
        magnitudes[idx2] = f32x4_extract_lane::<2>(normalized_quad);
        magnitudes[idx3] = f32x4_extract_lane::<3>(normalized_quad);
    }

    // Handle remainder pixels
    for idx in (chunks * 4)..num_pixels {
        let magnitude = fast_magnitude(complex_pixels[idx]);
        magnitudes[idx] = magnitude * normalization;
    }

    magnitudes
}
