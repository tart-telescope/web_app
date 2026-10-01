# tart-catalogue-wasm

Browser-side satellite horizontal (az/el/range) computation from TLEs, for the
TART viewer. A thin wasm binding layer over [`tart-catalogue-core`]; the network
fetch and the TLE cache live in JavaScript.

    make test                  # native tests incl. parity vs astropy vectors
    make build_wasm_tart       # builds ../tart-viewer/pkg-catalogue

## What is here, and what is not

The maths is not in this repo. It is [`tart-catalogue-core`], the TART
collaboration's pure-computation library, published by Tim Molteno and the TART
collaboration:

- Crate: <https://crates.io/crates/tart-catalogue-core>
- Source: <https://github.com/tart-telescope/catalogue>
- Licence: GPL-3.0-only, the same licence this crate carries

This crate re-exports it (`pub use tart_catalogue_core::{geo, propagation, time}`)
and adds the `wasm-bindgen` layer in `src/wasm.rs`. That split is deliberate:
the core carries no I/O and builds for `wasm32-unknown-unknown`, while the
fetch, the IndexedDB cache, the local-first/remote fallback and the packaging
stay where the one implementation of that policy already is — here.

|                     | `tart-catalogue-core`     | `tart-catalogue-wasm` (here)         |
| ------------------- | ------------------------- | ------------------------------------ |
| Contents            | time, geo, propagation    | `wasm.rs` only                       |
| Target              | native and wasm32         | `wasm32-unknown-unknown`             |
| Library target      | `rlib`                    | `cdylib` + `rlib`, so wasm-pack and `cargo test` both work |
| Network / cache     | neither — pure            | neither; the viewer's JavaScript does both |
| Output              | Rust values               | `serde-wasm-bindgen` back to JS      |
| One call covers     | many instants × many satellites | the same, passed through       |

The bulk entry point is the one that matters for a viewer. Scrubbing a history
asks for positions at up to 3600 instants across ~140 satellites, so the API is
bulk by design: `horizontal_positions_bulk`, one call, with the TEME→ECEF
rotation computed once per instant and shared across every satellite rather
than recomputed per satellite. It lives in the core, not here, so it is
reviewed and reused upstream rather than in a shim.

## Why the maths moved upstream

`tart-catalogue-client` — the same collaboration's Rust client for the same
`/ephemerides` backend — could not be linked here: it publishes no library
target (`has_lib: false`), it depends on `tokio` with `full`, and its cache
writes to `~/.cache` through `std::fs`. None of that builds for
`wasm32-unknown-unknown`, and none of it is fixable from this repo.

So this crate carried its own copy of the maths, and reported the two date/time
bugs that copy was written to avoid — [issue #9], fixed upstream in [`25172fb`].
The core was then split out of the client in [`d244f3d`] for exactly this use,
and this crate now depends on it instead of duplicating it. The copy here is
gone; the vector suite in `tests/` stays, as the gate on the pinned version.

## The two date/time bugs, on record

Both were measured against the live `GET /catalog` for the same observer and
instant, matching by satellite name:

| Build                          | Azimuth (median / max) | Elevation (median / max) |
| ------------------------------ | ---------------------- | ------------------------ |
| Upstream, as published         | 172.6° / 341.7°        | 45.0° / 125.5°           |
| With the epoch fix only        | 156.8° / 201.7°        | 48.4° / 90.0°            |
| Both fixed                     | 0.006° / **0.029°**    | 0.004° / **0.010°**      |

**Epoch units.** The client subtracted `Elements::epoch()` — *years* since
J2000 — from a Julian Day offset in *days*. Dimensionally invalid, and worth
about 74 years. Its tests passed regardless, because the test TLE carries zero
drag, so the radial assertion never noticed the phase error. The fix is sgp4's
own `datetime_to_minutes_since_epoch`, which is what the core now calls.

**The Julian Day of the unix epoch.** `2_440_587.5`, and the `.5` is the whole
point: Julian Days begin at noon. Fliegel–Van Flandern returns a Julian Day
*Number*, which refers to noon, so the result was half a day — and therefore
~180.5° of GMST — out. That the second bug was independent of the first only
became clear when fixing the first still left azimuth wrong by a median of
157°.

Everything above the maths — the fetch, the TLE cache in IndexedDB, the decision
to fall back to the remote `/catalog` — lives in the viewer's JavaScript.

[`tart-catalogue-core`]: https://crates.io/crates/tart-catalogue-core
[issue #9]: https://github.com/tart-telescope/catalogue/issues/9
[`25172fb`]: https://github.com/tart-telescope/catalogue/commit/25172fb
[`d244f3d`]: https://github.com/tart-telescope/catalogue/commit/d244f3d4caa1deb50b072747ec90c2199da47fc8
