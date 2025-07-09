# TART Web App

A Vue.js frontend application with Rust/WebAssembly components for TART telescope visualization.

## Architecture

- `tart-viewer/` - Vue3 frontend with Vite build system
- `rust/` - Rust code compiled to WebAssembly
- `withoutBundler/` - Minimal WASM usage example


## UI Dev
```
    pnpm dev
```
### Optionally forward Backend proxy to 1234
Expects bare api (no api/v1/)
```
    ssh -L 1234:localhost:5000 tart@nz-elec # (optional for local model)
```


## Deployment Variants

The app builds two Docker image variants:

1. **Root deployment** (`viewer-root`): Served at `/` (e.g., TART devices)
2. **Subpath deployment** (`viewer-subpath`): Served at `/viewer/` (e.g., hosted sites)

## Quick Start

### Build All Images
```bash
make build-all
```

### Build Individual Components
```bash
make build-deps      # Build shared dependencies
make build-variants  # Build app variants
make build-docker    # Build multi-platform images
```

### Development
```bash
make test           # Test with docker-compose
make local          # Build locally
make clean          # Clean build artifacts
```

## Multi-Platform Builds

The build system creates multi-platform images (amd64 + arm64):

1. **Shared Dependencies**: Rust compilation, npm install, wasm-pack (once)
2. **App Variants**: Different BASE_URL builds using shared deps
3. **Multi-Platform**: Copy static assets to nginx containers for both architectures

## GitHub Actions

Automated builds on push/PR:
- `build-docker.yml` - Full build and push to GHCR
- `test-build.yml` - Test builds without pushing

## Images

Built images are available at:
- `ghcr.io/tart-telescope/web_app/viewer-root:latest`
- `ghcr.io/tart-telescope/web_app/viewer-subpath:latest`

## Legacy Deploy

For deployment to tart.elec.ac.nz:
```bash
make deploy  # Requires SSH access
```
