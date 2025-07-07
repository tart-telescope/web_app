//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
//! Gridless deconvolution algorithms for radio astronomy imaging.
//!
//! This module provides both standard and SIMD-optimized implementations
//! of gridless imaging techniques that avoid the traditional gridding step,
//! directly computing sky brightness from visibility measurements using
//! spherical harmonics.

// Re-export core functions
pub use crate::gridless_core::{compute_fourier_harmonics, reconstruct_sky_image};

// Re-export SIMD functions
#[cfg(target_arch = "wasm32")]
pub use crate::wasm::gridless_simd::reconstruct_sky_image_simd;

#[cfg(not(target_arch = "wasm32"))]
pub use crate::gridless_core::reconstruct_sky_image as reconstruct_sky_image_simd;
