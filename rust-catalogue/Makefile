# Build targets for the browser-side catalogue module.
#
# Mirrors rust/Makefile conventions. Unlike the gridless crate there is no
# SIMD here (sgp4 has no SIMD paths), so the production build deliberately
# omits the +simd128 flags.

all: check_wasm

# Kept so the target still exists, but there is nothing for it to run: the
# maths moved to tart-catalogue-core and the astropy vectors went with it, and
# the binding layer is wasm32-only. This compiles the crate for the host.
test:
	cargo test

check_wasm:
	cargo check --target wasm32-unknown-unknown

# Standalone package, for inspection.
build_wasm_pkg:
	RUST_LOG=info wasm-pack build --release --target web

# What the viewer consumes.
build_wasm_tart:
	RUST_LOG=info wasm-pack build --release --target web --out-dir ../tart-viewer/pkg-catalogue

# Production build used by Docker/CI.
export-wasm-production:
	wasm-pack build --release --target web --out-dir ../tart-viewer/pkg-catalogue

# Node-targeted build, for running scripts/ out of a plain Node process.
build_wasm_node:
	wasm-pack build --release --target nodejs --out-dir pkg-node

# Chunk-size trade-off for the viewer's enrichment loop.
benchmark-chunks: build_wasm_node
	node scripts/benchmark-chunk-sizes.mjs 3600 /tmp/eph.json

.PHONY: all test check_wasm build_wasm_pkg build_wasm_tart export-wasm-production build_wasm_node benchmark-chunks
