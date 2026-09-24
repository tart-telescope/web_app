# tart-catalogue

Browser-side satellite horizontal (az/el/range) computation from TLEs, for the
TART viewer. Pure computation: the network fetch and the TLE cache live in
JavaScript.

    make test                  # native tests incl. parity vs astropy vectors
    make build_wasm_tart       # builds ../tart-viewer/pkg-catalogue

See `src/propagation.rs` for why this is a reimplementation rather than a
wrapper around `tart-catalogue-client`.
