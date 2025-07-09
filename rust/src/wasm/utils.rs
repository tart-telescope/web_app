//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
//! WASM utility functions for the gridless imaging library.
//!
//! This module provides utility functions specifically for WebAssembly
//! integration, including hemisphere caching and data processing helpers.

use chrono::{DateTime, Utc};

/// Convert a chrono DateTime to JavaScript timestamp (milliseconds since epoch)
pub fn datetime_to_js_timestamp(datetime: &DateTime<Utc>) -> f64 {
    datetime.timestamp_millis() as f64
}
