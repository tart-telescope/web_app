//! Browser-side satellite horizontal positions for the TART catalogue.
//!
//! Given TLEs fetched from the catalogue's `/ephemerides` endpoint, this crate
//! propagates them with SGP4 and converts to azimuth/elevation/range for an
//! observer. Neither the network fetch nor the TLE cache lives here: those are
//! the viewer's JavaScript. What is here is the binding between that JavaScript
//! and the maths in [`tart_catalogue_core`].
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
//! fixed in `25172fb`). The README records the measurements behind the report.
//!
//! What is left here is the wasm binding layer in [`wasm`], and nothing else.
//! The astropy vector suite and the parity harness that used to live in this
//! crate went with the maths: they exercised the core, which tests itself, and
//! they are upstream's now. There are no tests because there is nothing left
//! here that is ours to test — [`wasm`] is wasm32-only, so it does not even
//! compile for the host target `cargo test` builds against. `make check_wasm`
//! is the check that matters.

pub use tart_catalogue_core::{geo, propagation, time};

#[cfg(target_arch = "wasm32")]
pub mod wasm;
