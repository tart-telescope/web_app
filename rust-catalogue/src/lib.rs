//! WebAssembly bindings for the viewer's satellite look angles: TLEs in,
//! azimuth/elevation/range out, for one observer across many instants.
//!
//! The maths is [`tart_catalogue_core`] — TLE propagation, geodesy, sidereal
//! time — re-exported here so callers keep one import path. This crate adds
//! what the browser needs on top and nothing else: a stateful
//! [`wasm::CataloguePropagators`] that builds SGP4 constants once per TLE set
//! and reuses them across queries, and the JSON shape the viewer's JavaScript
//! reads back.
//!
//! The network fetch and the TLE cache are the viewer's JavaScript, not this
//! crate's.
//!
//! No tests: [`wasm`] is `wasm32`-only, so it does not compile for the host
//! target `cargo test` builds against, and the maths is tested in the core.

pub use tart_catalogue_core::{geo, propagation, time};

#[cfg(target_arch = "wasm32")]
pub mod wasm;
