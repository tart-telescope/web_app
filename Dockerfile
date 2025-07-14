# syntax=docker/dockerfile:1
# Rust build stage
FROM rustlang/rust:nightly-slim AS rust-build
WORKDIR /app/rust

# Install system dependencies
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install wasm-pack with cache mount
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/root/.cargo/git \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Copy rust project
COPY rust ./

# Build WASM with cache mounts
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/root/.cargo/git \
    --mount=type=cache,target=target \
    RUSTFLAGS='-C target-feature=+simd128,+bulk-memory,+nontrapping-fptoint -C opt-level=3 -C codegen-units=1' \
    RUST_LOG=info wasm-pack build --release --target web --out-dir ./pkg \
        -- --features fast-math,simd,browser --no-default-features

# Web App build stage
FROM node:24-alpine AS node-build-stage
WORKDIR /app/tart-viewer

# Install pnpm with cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# Copy package files for better layer caching
COPY tart-viewer/package.json tart-viewer/pnpm-lock.yaml ./

# Install dependencies with cache mount
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    mkdir -p ./pkg && \
    pnpm install --frozen-lockfile

# Copy WASM package from rust build
COPY --from=rust-build /app/rust/pkg ./pkg

# Reinstall to link WASM package
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY tart-viewer ./

# if base url is not set. fallback to /
ARG BASE_URL
ENV BASE_URL=$BASE_URL

ARG CI_COMMIT_SHA
ENV CI_COMMIT_SHA=$CI_COMMIT_SHA
ENV VITE_COMMIT_SHA=$CI_COMMIT_SHA

# Build with cache mount for node_modules
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm build --base=$BASE_URL/

# Compress static files
RUN find ./dist -type f -regex '.*\.\(htm\|html\|wasm\|eot\|ttf\|txt\|text\|js\|css\)$' -exec gzip -f --best -k {} \;

# Multi-arch production stage
FROM nginx:stable-alpine AS production-stage

ARG BASE_URL
ENV BASE_URL=$BASE_URL
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY --from=node-build-stage /app/tart-viewer/dist /usr/share/nginx/html$BASE_URL/

# Generate nginx.conf from template with environment substitution
RUN envsubst '${BASE_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

EXPOSE 80
