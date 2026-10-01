# tart-catalogue-wasm

WebAssembly bindings for the TART viewer's satellite look angles: TLEs in,
azimuth/elevation/range out, for one observer across many instants.

    make check_wasm            # compiles for wasm32 — the check that matters
    make build_wasm_tart       # builds ../tart-viewer/pkg-catalogue

## Layout

- **`src/lib.rs`** — re-exports [`tart-catalogue-core`] (`geo`, `propagation`,
  `time`), so callers have one import path.
- **`src/wasm.rs`** — the binding layer. Exports `CataloguePropagators`, which
  builds SGP4 constants once per TLE set and reuses them: `horizontal_positions`
  for one instant, `horizontal_positions_bulk` for many. Rows come back as JSON,
  range in metres to match the server's `r`.
- **`scripts/benchmark-chunk-sizes.mjs`** — measures the viewer's chunk-size
  trade-off against the nodejs-target build.

The network fetch, the IndexedDB TLE cache, the local-first/remote fallback and
the packaging are the viewer's, not this crate's.

No tests: `wasm.rs` is `wasm32`-only, so it does not compile for the host target
`cargo test` builds against, and the maths is tested in the core.

## Licence and credits

[`tart-catalogue-core`] is the TART collaboration's, by Tim Molteno — GPL-3.0-only,
the same licence this crate carries.

- Crate: <https://crates.io/crates/tart-catalogue-core>
- Source: <https://github.com/tart-telescope/catalogue>

[`tart-catalogue-core`]: https://crates.io/crates/tart-catalogue-core
