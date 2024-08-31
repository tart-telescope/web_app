NSIDE=40

all:
	cargo run -- --nside ${NSIDE} --sources --file data.json

pixels:
	cargo run -- --nside 3 --file data.json --pixels

build_wasm_pkg:
	RUST_LOG=info wasm-pack build --release

# This is needed to build the wasm for the viewer, when developing the viewer native with hmr enabled
build_wasm_tart:
	RUST_LOG=info wasm-pack build --release --out-dir ../tart-viewer/pkg

HOST=https://api.elec.ac.nz
API=${HOST}/tart/mu-udm/api/v1/

get:
	tart_calibration_data --n 1 --file data.json

download: catalog
	curl -o info.json "${API}/info"
	curl -o vis.json "${API}/imaging/vis"
	curl -o antenna_positions.json "${API}/imaging/antenna_positions"
	curl -o gains.json "${API}/calibration/gain"

catalog:
	curl -o catalog.json "${HOST}/catalog/catalog?lat=-45.85&lon=170.54"


# Requires perf-tools-unstable
# echo -1 > /proc/sys/kernel/perf_event_paranoid
profile:
	RUSTFLAGS='-g'; cargo build --release
	perf record --call-graph=dwarf ./target/release/gridless --nside 7 --file data.json

speed:
	#cargo clean
	RUSTFLAGS='-C opt-level=2 -C target-cpu=native' cargo build --release

test:
	./target/release/gridless --sources --file data.json --nside 2
	./target/release/gridless --sources --file data.json --nside 4
	./target/release/gridless --sources --file data.json --nside 6
	./target/release/gridless --sources --file data.json --nside 8
	./target/release/gridless --sources --file data.json --nside 10
	./target/release/gridless --sources --file data.json --nside 12
	./target/release/gridless --sources --file data.json --nside 14
	./target/release/gridless --sources --file data.json --nside 16
	./target/release/gridless --sources --file data.json --nside 18
	./target/release/gridless --sources --file data.json --nside 20
	./target/release/gridless --sources --file data.json --nside 22
	./target/release/gridless --sources --file data.json --nside 24
	./target/release/gridless --sources --file data.json --nside 28
	./target/release/gridless --sources --file data.json --nside 32
	./target/release/gridless --sources --file data.json --nside 36
	./target/release/gridless --sources --file data.json --nside 40
	./target/release/gridless --sources --file data.json --nside 44
	./target/release/gridless --sources --file data.json --nside 48
	./target/release/gridless --sources --file data.json --nside 64
	./target/release/gridless --sources --file data.json --nside 96
	./target/release/gridless --sources --file data.json --nside 128
	./target/release/gridless --sources --file data.json --nside 192
	./target/release/gridless --sources --file data.json --nside 256
