//! Browser-side satellite horizontal positions for the TART catalogue.
//!
//! Given TLEs fetched from the catalogue's `/ephemerides` endpoint, this crate
//! propagates them with SGP4 and converts to azimuth/elevation/range for an
//! observer. The network fetch and the TLE cache live in JavaScript; only the
//! math lives here.
//!
//! The maths is not ours. It is
//! [`tart-catalogue-core`](https://crates.io/crates/tart-catalogue-core), the
//! collaboration's own pure-computation library
//! (<https://github.com/tart-telescope/catalogue>), re-exported here so this
//! crate's callers keep one import path. The core was split out of
//! `tart-catalogue-client` in
//! [d244f3d](https://github.com/tart-telescope/catalogue/commit/d244f3d4caa1deb50b072747ec90c2199da47fc8)
//! for precisely this use: the client itself remains unusable here — no
//! library target, `tokio`, and a cache under `~/.cache` — but the core builds
//! for `wasm32-unknown-unknown` and carries no I/O.
//!
//! That split followed this crate's own report of the client's two date/time
//! bugs ([issue #9](https://github.com/tart-telescope/catalogue/issues/9),
//! fixed in `25172fb`). The vector suite in `tests/` is kept as the gate on the
//! pinned version, and the README records the measurements behind the report.
//!
//! What is left here is the wasm binding layer in [`wasm`]. The maths modules
//! are not wasm-gated, so the whole thing is testable with a plain
//! `cargo test`.

pub use tart_catalogue_core::{geo, propagation, time};

#[cfg(target_arch = "wasm32")]
pub mod wasm;
