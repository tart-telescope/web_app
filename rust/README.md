# Gridless Radio Astronomy Imaging

A high-performance Rust library for radio astronomy imaging using gridless deconvolution techniques. Produces sky images from radio telescope visibility data without traditional gridding artifacts.

## Features

- **Gridless Algorithm**: Direct Fourier transform without gridding interpolation
- **High Performance**: Optimized mathematical functions and parallel processing
- **WebAssembly Support**: Runs in browsers with optimized performance
- **Multiple Backends**: Native binary and library interfaces
- **Template System**: Sailfish-based SVG generation for visualization

## Quick Start

### Installation

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Build the project
cargo build --release
```

### Basic Usage

```bash
# Generate SVG from observation data
cargo run --bin gridless -- --nside 32 --file data.json
```

### Library Usage

```rust
use gridlesslib::{json_to_svg, file_to_dataset, get_obs_from_dataset};

let json_data = std::fs::read_to_string("observation.json")?;
let (svg_content, timestamp) = json_to_svg(&json_data, 32, true);
std::fs::write("output.svg", svg_content)?;
```

## Performance Optimizations

### Fast Math (Optional)
Enable polynomial approximations for ~3-5× speedup in trigonometric calculations:
```bash
cargo build --release --features fast-math
```



### WebAssembly Build
```bash
wasm-pack build --target web --features browser
```

## WebAssembly API

### Color Data Functions

The library provides efficient WASM functions for extracting color data from observations:

#### `get_color_values_only(json: String, nside: u32) -> JsValue`
Returns normalized float values (0.0-1.0) as Float32Array for client-side color mapping.

#### `get_color_bytes_only(json: String, nside: u32) -> JsValue`
Returns pre-computed RGB color bytes as Uint8Array with RGB triplets (3 bytes per pixel).

**Performance Comparison:**
- **Float32Array**: 4 bytes per value, requires client-side color mapping
- **Uint8Array RGB**: 3 bytes per pixel, color mapping done in WASM
- **Data Size**: ~25% smaller for RGB bytes (588KB vs 784KB for NSIDE 128)
- **Processing**: RGB method eliminates client-side color mapping overhead

```javascript
import init, { get_color_values_only, get_color_bytes_only } from './pkg/gridlesslib.js';

// Method 1: Float values + client-side mapping
const floatArray = get_color_values_only(jsonData, 128);
const colors = Array.from(floatArray);
// Apply your own color mapping...

// Method 2: Pre-computed RGB bytes (more efficient)
const rgbArray = get_color_bytes_only(jsonData, 128);
const rgbBytes = Array.from(rgbArray);
for (let i = 0; i < rgbBytes.length; i += 3) {
    const r = rgbBytes[i];
    const g = rgbBytes[i + 1]; 
    const b = rgbBytes[i + 2];
    // Apply rgb(r, g, b) directly to DOM elements
}
```

## Command Line Options

- `--nside <N>`: HEALPix resolution parameter (higher = more detail)
- `--sources`: Include known source positions in output
- `--file <path>`: Input JSON observation file (default: data.json)

## Architecture

- **Core Algorithm** (`gridless.rs`): Main imaging reconstruction
- **Fast Math** (`fast_math.rs`): Optimized trigonometric functions  
- **Sphere Handling** (`sphere.rs`): HEALPix hemisphere management
- **Data Processing** (`tart_api.rs`, `tart_obs.rs`): Observation data parsing
- **Visualization** (`template/`): SVG generation and rendering

## File Formats

**Input**: JSON files containing:
- Antenna positions and baselines
- Complex visibility measurements
- Observation metadata and timestamps

**Output**: SVG images showing reconstructed sky brightness

## Documentation

- `INSTALL.md`: Detailed installation instructions
- `PERFORMANCE.md`: Performance characteristics and optimization guide

## License

Copyright (c) 2019-2024 Tim Molteno <tim@elec.ac.nz>

This project is open source software. See license file for details.