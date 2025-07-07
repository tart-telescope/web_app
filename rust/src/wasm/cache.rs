//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
//! WASM-specific caching optimizations for hemisphere data.
//!
//! This module provides WebAssembly-specific caching mechanisms to avoid
//! expensive recomputation of hemisphere geometry data in browser environments.

use crate::sphere::Hemisphere;
use std::cell::RefCell;

thread_local! {
    static HEMISPHERE_CACHE: RefCell<Option<(u32, Hemisphere)>> = const { RefCell::new(None) };
}

/// Get or create a hemisphere with automatic caching.
///
/// This function implements a simple LRU cache (size=1) for hemisphere data.
///
/// ## Cache Behavior:
/// - **Single entry**: Stores one hemisphere at a time (most recently used)
/// - **Thread-local**: Each thread/worker has its own cache
/// - **Clone-based**: Returns cloned data (metadata only, not expensive)
/// - **Automatic eviction**: Replaced when different nside is requested
///
/// ## Performance Benefits:
/// - Eliminates repeated HEALPix coordinate calculations
/// - Avoids trigonometric computations for same nside
/// - Reduces memory allocations for repeated operations
/// - Optimized for typical usage patterns (same nside used repeatedly)
/// If the requested nside matches the cached value, returns a clone of the
/// cached hemisphere. Otherwise, creates a new hemisphere and caches it.
///
/// ## Cache Strategy:
/// 1. Check if cached hemisphere matches requested nside
/// 2. If match: return cloned cached hemisphere (fast path)
/// 3. If no match: create new hemisphere and cache it (slow path)
/// 4. Return the newly created hemisphere
///
/// ## Memory Usage:
/// - Cloning hemisphere data is relatively cheap (mostly Vec metadata)
/// - The actual coordinate data is efficiently copied
/// - Cache holds only one hemisphere at a time
///
/// ## Thread Safety:
/// - Uses thread_local storage for WebAssembly compatibility
/// - Each WebAssembly worker thread has independent cache
/// - No cross-thread synchronization needed
pub fn get_or_create_hemisphere(nside: u32) -> Hemisphere {
    HEMISPHERE_CACHE.with(|cache| {
        let mut cache_ref = cache.borrow_mut();

        // Check if we have a cached hemisphere for this nside
        if let Some((cached_nside, ref cached_hemisphere)) = *cache_ref {
            if cached_nside == nside {
                // Clone the cached hemisphere (just data, not expensive geometry calculations)
                return cached_hemisphere.clone();
            }
        }

        // Create new hemisphere and cache it
        let new_hemisphere = Hemisphere::new(nside);
        *cache_ref = Some((nside, new_hemisphere.clone()));
        new_hemisphere
    })
}

/// Clear the hemisphere cache.
///
/// Useful for testing or when memory usage needs to be minimized.
/// In production WebAssembly environments, the cache typically doesn't
/// need explicit clearing as it's automatically evicted.
#[allow(dead_code)]
pub fn clear_hemisphere_cache() {
    HEMISPHERE_CACHE.with(|cache| {
        let mut cache_ref = cache.borrow_mut();
        *cache_ref = None;
    });
}

/// Get cache statistics for debugging and monitoring.
///
/// Returns information about the current cache state, useful for
/// performance analysis and debugging in development environments.
///
/// Returns: Option<(cached_nside, cache_hit_potential)>
/// - None if cache is empty
/// - Some((nside, true)) if cache contains data that could serve requests
#[allow(dead_code)]
pub fn get_cache_info() -> Option<u32> {
    HEMISPHERE_CACHE.with(|cache| {
        let cache_ref = cache.borrow();
        cache_ref.as_ref().map(|(nside, _)| *nside)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_miss_then_hit() {
        clear_hemisphere_cache();

        // First call should be cache miss
        let hemisphere1 = get_or_create_hemisphere(8);
        assert_eq!(hemisphere1.nside, 8);

        // Second call with same nside should be cache hit
        let hemisphere2 = get_or_create_hemisphere(8);
        assert_eq!(hemisphere2.nside, 8);

        // Should have same structure
        assert_eq!(hemisphere1.npix, hemisphere2.npix);
        assert_eq!(
            hemisphere1.visible_indices.len(),
            hemisphere2.visible_indices.len()
        );
    }

    #[test]
    fn test_cache_eviction() {
        clear_hemisphere_cache();

        // Cache hemisphere with nside=8
        let hemisphere1 = get_or_create_hemisphere(8);
        assert_eq!(get_cache_info(), Some(8));

        // Request different nside should evict cache
        let hemisphere2 = get_or_create_hemisphere(16);
        assert_eq!(hemisphere2.nside, 16);
        assert_eq!(get_cache_info(), Some(16));

        // Original nside should now be cache miss
        let hemisphere3 = get_or_create_hemisphere(8);
        assert_eq!(hemisphere3.nside, 8);
        assert_eq!(get_cache_info(), Some(8));
    }

    #[test]
    fn test_cache_clear() {
        // Put something in cache
        let _hemisphere = get_or_create_hemisphere(8);
        assert_eq!(get_cache_info(), Some(8));

        // Clear cache
        clear_hemisphere_cache();
        assert_eq!(get_cache_info(), None);
    }

    #[test]
    fn test_different_nside_values() {
        clear_hemisphere_cache();

        let nside_values = [4, 8, 16, 32];

        for &nside in &nside_values {
            let hemisphere = get_or_create_hemisphere(nside);
            assert_eq!(hemisphere.nside, nside);
            assert!(hemisphere.npix > 0);

            // Cache should contain this nside
            assert_eq!(get_cache_info(), Some(nside));
        }
    }

    #[test]
    fn test_hemisphere_properties_consistency() {
        clear_hemisphere_cache();

        let hemisphere1 = get_or_create_hemisphere(8);
        let hemisphere2 = get_or_create_hemisphere(8); // Should be cached

        // Should have identical properties
        assert_eq!(hemisphere1.nside, hemisphere2.nside);
        assert_eq!(hemisphere1.npix, hemisphere2.npix);
        assert_eq!(hemisphere1.visible_indices, hemisphere2.visible_indices);
        assert_eq!(hemisphere1.l.len(), hemisphere2.l.len());
        assert_eq!(hemisphere1.m.len(), hemisphere2.m.len());
        assert_eq!(hemisphere1.n.len(), hemisphere2.n.len());
    }
}
