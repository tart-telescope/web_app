//! Browser-side satellite horizontal positions for the TART catalogue.
//!
//! Given TLEs fetched from the catalogue's `/ephemerides` endpoint, this crate
//! propagates them with SGP4 and converts to azimuth/elevation/range for an
//! observer. The network fetch and the TLE cache live in JavaScript; only the
//! math lives here.
//!
//! This is a deliberate reimplementation rather than a wrapper around
//! [`tart-catalogue-client`](https://crates.io/crates/tart-catalogue-client),
//! the TART collaboration's Rust client for the same catalogue and the same
//! `/ephemerides` backend
//! (<https://github.com/tart-telescope/catalogue>). That client cannot be used
//! here: it publishes no library target (so there is nothing to link), it
//! depends on `tokio` with `full` (unsupported on `wasm32-unknown-unknown`),
//! and its cache writes to `~/.cache` through `std::fs`. Its epoch handling is
//! also incorrect — see the note in [`propagation::propagate_to_ecef`].
//!
//! The README records the attribution and the two date/time bugs this routes
//! around, with the measurements that found them.
//!
//! The math modules are not wasm-gated so the whole thing is testable with a
//! plain `cargo test`.

pub mod geo;
pub mod propagation;
pub mod time;

#[cfg(target_arch = "wasm32")]
pub mod wasm;
