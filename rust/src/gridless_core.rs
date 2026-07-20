//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
//! Core gridless deconvolution algorithms for radio astronomy imaging.
//!
//! This module implements efficient gridless imaging techniques that avoid
//! the traditional gridding step, directly computing sky brightness from
//! visibility measurements using spherical harmonics.

use crate::sphere::Hemisphere;
use crate::utils::{TWO_PI, VectorComplex, VectorReal};
use crate::utils::{fast_magnitude, fast_sin_cos};
use ndarray::{Array1, Ix1, Zip};
use rayon::prelude::*;

/// Computes Fourier harmonics and accumulates directly into complex_pixels.
///
/// This fused implementation eliminates the intermediate allocation of
/// `Vec<VectorComplex>` that stored all harmonics separately. Instead,
/// harmonics are computed and immediately accumulated into the output
/// buffer, using parallel reduction for multi-core acceleration.
///
/// # Performance Optimizations
/// - **Fused compute-accumulate**: No intermediate storage of all harmonics
/// - **Parallel reduction**: Each thread accumulates into a local buffer,
///   reducing memory contention and improving cache locality
/// - **Chunked baselines**: Baselines are distributed across threads in
///   chunks to minimize reduction overhead
/// - **Pre-computed constants**: n_minus_one computed once per reconstruction
///
/// # Arguments
/// * `visibilities` - Complex visibility measurements from interferometer
/// * `u_coords` - u-coordinates of baselines (wavelengths)
/// * `v_coords` - v-coordinates of baselines (wavelengths)
/// * `w_coords` - w-coordinates of baselines (wavelengths)
/// * `sky` - Sky hemisphere containing pixel coordinates (l, m, n)
///
/// # Returns
/// Accumulated complex pixel array (before normalization)
fn accumulate_fused_harmonics(
    visibilities: &VectorComplex,
    u_coords: &VectorReal,
    v_coords: &VectorReal,
    w_coords: &VectorReal,
    sky: &Hemisphere,
) -> VectorComplex {
    let num_baselines = visibilities.len();
    let num_pixels = sky.visible_pix.len();

    // Pre-compute n - 1.0 for all pixels (done once per reconstruction)
    let n_minus_one: Array1<f32> = sky.n.mapv(|n| n - 1.0);

    // Parallel reduction: each chunk computes a partial sum into a local buffer
    let chunk_size = (num_baselines / rayon::current_num_threads()).max(1);

    (0..num_baselines)
        .collect::<Vec<_>>()
        .par_chunks(chunk_size)
        .map(|baseline_chunk| {
            let mut local_pixels = VectorComplex::zeros(Ix1(num_pixels));

            for &baseline_idx in baseline_chunk {
                let visibility = visibilities[baseline_idx];
                let u = u_coords[baseline_idx];
                let v = v_coords[baseline_idx];
                let w = w_coords[baseline_idx];

                // Compute phase angles for this baseline
                let mut phase_angles = VectorReal::zeros(Ix1(num_pixels));
                let phase_mult = -TWO_PI;
                Zip::from(&mut phase_angles)
                    .and(&sky.l)
                    .and(&sky.m)
                    .and(&n_minus_one)
                    .for_each(|phase, &l, &m, &n| {
                        *phase = phase_mult * (u * l + v * m + w * n);
                    });

                // Compute sin/cos and accumulate: local_pixels += vis * exp(i*phase)
                Zip::from(&mut local_pixels)
                    .and(&phase_angles)
                    .for_each(|pixel, &phase| {
                        let (sin_p, cos_p) = fast_sin_cos(phase);

                        // Complex multiplication: vis * (cos + i*sin)
                        let vis_re = visibility.re;
                        let vis_im = visibility.im;

                        pixel.re += vis_re * cos_p - vis_im * sin_p;
                        pixel.im += vis_re * sin_p + vis_im * cos_p;
                    });
            }

            local_pixels
        })
        .reduce(|| VectorComplex::zeros(Ix1(num_pixels)), |a, b| a + b)
}

/// Performs gridless imaging from visibility measurements with enhanced performance.
///
/// This is the core imaging function that reconstructs sky brightness from
/// interferometric visibility data without using a traditional uv-grid.
/// The algorithm directly computes the inverse Fourier transform using
/// pre-calculated harmonics with parallel processing.
///
/// # Arguments
/// * `visibilities` - Complex visibility measurements from interferometer
/// * `u_coords` - u-coordinates of baselines (wavelengths)
/// * `v_coords` - v-coordinates of baselines (wavelengths)
/// * `w_coords` - w-coordinates of baselines (wavelengths)
/// * `sky` - Mutable reference to sky hemisphere to store results
/// * `use_real_only` - If true, use only real part; if false, use magnitude
///
/// # Algorithm
/// 1. Compute Fourier harmonics for each baseline and accumulate in parallel (fused)
/// 2. Convert complex result to real values (fast magnitude calculation)
///
/// # Performance Optimizations
/// - Fused compute-accumulate eliminates intermediate Vec<VectorComplex> allocation
/// - Parallel reduction via Rayon for multi-core acceleration
/// - Single-pass phase+accumulate per baseline for cache efficiency
/// - Fast magnitude calculation using optimized norm computation
pub fn reconstruct_sky_image(
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

    // Fused harmonic computation + accumulation (no intermediate storage)
    let complex_pixels =
        accumulate_fused_harmonics(visibilities, u_coords, v_coords, w_coords, sky);

    // Apply normalization once at the end
    let normalization = (num_sky_pixels as f32).sqrt().recip();

    // Convert complex result to real values
    if use_real_only {
        // Use only real part (faster)
        sky.visible_pix = complex_pixels.mapv(|pixel| pixel.re * normalization);
    } else {
        // Use magnitude (more robust)
        sky.visible_pix = complex_pixels.mapv(|pixel| fast_magnitude(pixel) * normalization);
    }

    Ok(())
}
