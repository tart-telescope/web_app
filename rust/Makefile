NSIDE=40

all:
	cargo run --bin gridless -- --nside ${NSIDE} --sources --file data.json

pixels:
	cargo run --bin gridless -- --nside 3 --file data.json

# SVG Generation Targets with Enhanced Features

# Generate full-featured SVG with colorbar and statistics overlay
# This creates a comprehensive visualization including:
# - Radio source markers (--sources)
# - Statistical information overlay (--stats)
# - Color scale legend/colorbar (--colorbar)
full:
	cargo run --bin gridless -- --nside ${NSIDE} --sources --stats --colorbar --file data.json

# Generate SVG with just statistics overlay (no colorbar)
stats:
	cargo run --bin gridless -- --nside ${NSIDE} --sources --stats --file data.json

# Generate SVG with just colorbar (no statistics overlay)
colorbar:
	cargo run --bin gridless -- --nside ${NSIDE} --sources --colorbar --file data.json

build_wasm_pkg:
	RUST_LOG=info wasm-pack build --release

# This is needed to build the wasm for the viewer, when developing the viewer native with hmr enabled
build_wasm_tart:
	RUST_LOG=info wasm-pack build --release --out-dir ../tart-viewer/pkg

HOST=https://api.elec.ac.nz
API=${HOST}/tart/zm-cbu/api/v1/

get:
	tart_calibration_data --n 1 --file data.json

download: catalog
	curl -o info.json "${API}/info"
	curl -o vis.json "${API}/imaging/vis"
	curl -o antenna_positions.json "${API}/imaging/antenna_positions"
	curl -o gains.json "${API}/calibration/gain"

catalog:
	curl -o catalog.json "${HOST}/catalog/catalog?lat=-45.85&lon=170.54"


# Performance measurement and profiling targets

# Requires perf-tools-unstable
# echo -1 > /proc/sys/kernel/perf_event_paranoid
profile:
	RUSTFLAGS='-g' cargo build --profile profiling
	perf record --call-graph=dwarf ./target/profiling/gridless --nside 128 --file data.json
	perf report

# Optimized build for native CPU

speed:
	RUSTFLAGS='-C target-cpu=native' cargo build --timings --release --features fast-math

# Performance testing across different nside values
test:
	cargo build --release
	# RUSTFLAGS='-C opt-level=3 -C target-cpu=native' cargo build --release
	@echo "Running performance tests..."
	@for nside in 32 64 128 256; do \
		echo "Testing nside=$$nside"; \
		hyperfine './target/release/gridless --file data.json --nside '$$nside; \
	done

# WASM Build Targets - Optimized for different deployment scenarios

# Production WASM build with maximum optimization (recommended)
export-wasm-production:
	RUSTFLAGS='-C target-feature=+simd128,+bulk-memory,+nontrapping-fptoint -C opt-level=3 -C codegen-units=1' \
	wasm-pack build --release --target web --out-dir ../tart-viewer/pkg \
		-- --features fast-math,simd,browser --no-default-features

export-wasm-production-legacy:
	CARGO_FEATURES=fast-math wasm-pack build --release --target web --out-dir ../tart-viewer/pkg -- --features fast-math,simd
