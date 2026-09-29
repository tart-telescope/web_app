# tart-catalogue

Browser-side satellite horizontal (az/el/range) computation from TLEs, for the
TART viewer. Pure computation: the network fetch and the TLE cache live in
JavaScript.

    make test                  # native tests incl. parity vs astropy vectors
    make build_wasm_tart       # builds ../tart-viewer/pkg-catalogue

## Origin and attribution

This computes what [`tart-catalogue-client`] computes — the TART collaboration's
own Rust client for the catalogue, by Tim Molteno and the TART collaboration:

- Crate: <https://crates.io/crates/tart-catalogue-client>
- Source: <https://github.com/tart-telescope/catalogue>
- Licence: GPL-3.0-only, the same licence this crate carries

Same backend — the catalogue's `/ephemerides` endpoint — same quantity: a TLE
propagated with SGP4 to an observer's azimuth, elevation and range. The
propagation itself is the same [`sgp4`] crate.

What differs is the target. This is a library that compiles to
`wasm32-unknown-unknown`, so the browser can compute positions without a round
trip to the server.

It is a reimplementation, not a wrapper and not a port of upstream's code, which
cannot be reused:

|                       |                                                                          |
| --------------------- | ------------------------------------------------------------------------ |
| Binary-only           | `has_lib` is false — there is no library target to depend on.             |
| `tokio` with `full`   | Not supported on `wasm32-unknown-unknown`.                                |
| `~/.cache` via `std::fs` | Its TLE cache writes to a home directory, which a browser does not have. |

## Where this goes a different route

Two date/time bugs in the upstream client are why the time handling here is
written from scratch rather than followed. Both were measured against the live
`GET /catalog` for the same observer and instant, matching by satellite name:

| Build                          | Azimuth (median / max) | Elevation (median / max) |
| ------------------------------ | ---------------------- | ------------------------ |
| Upstream, as published         | 172.6° / 341.7°        | 45.0° / 125.5°           |
| With the epoch fix only        | 156.8° / 201.7°        | 48.4° / 90.0°            |
| Both fixed — what this does    | 0.006° / **0.029°**    | 0.004° / **0.010°**      |

**Epoch units.** Upstream subtracts `Elements::epoch()` — *years* since J2000 —
from a Julian Day offset in *days*. Dimensionally invalid, and worth about 74
years. Its own tests pass regardless, because the test TLE carries zero drag, so
the radial assertion never notices the phase error. This crate calls sgp4's
`datetime_to_minutes_since_epoch` instead; `src/propagation.rs` carries a note
saying not to follow the upstream arithmetic here.

**The Julian Day of the unix epoch.** `2_440_587.5`, and the `.5` is the whole
point: Julian Days begin at noon. The Fliegel–Van Flandern formula upstream uses
returns a Julian Day *Number*, which refers to noon, so it is half a day — and
therefore ~180.5° of GMST — out. That the second bug was independent of the first
only became clear when fixing the first still left azimuth wrong by a median of
157°.

Everything above the maths — the fetch, the TLE cache in IndexedDB, the decision
to fall back to the remote `/catalog` — lives in the viewer's JavaScript.

[`tart-catalogue-client`]: https://crates.io/crates/tart-catalogue-client
[`sgp4`]: https://crates.io/crates/sgp4
