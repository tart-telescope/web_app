#!/bin/bash
# Build multi-platform Docker images using new build system

export BUILD=$(git rev-parse --short HEAD)

make build-deps
make build-variants
make build-docker

echo "  ghcr.io/tart-telescope/web_app/viewer-root:${BUILD}"
echo "  ghcr.io/tart-telescope/web_app/viewer-root:latest"
echo "  ghcr.io/tart-telescope/web_app/viewer-subpath:${BUILD}"
echo "  ghcr.io/tart-telescope/web_app/viewer-subpath:latest"
