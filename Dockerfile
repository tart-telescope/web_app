# Rust build stage
FROM rustlang/rust:nightly-slim AS rust-build
WORKDIR /app/rust
RUN apt-get update && apt-get install -y curl
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
COPY rust /app/rust
RUN RUST_LOG=info wasm-pack build --release --out-dir ./pkg

# Web App build stage
FROM node:20 AS node-build-stage
WORKDIR /app/tart-vuer
RUN npm install -g pnpm

# Install basic dependencies
COPY tart-vuer/package.json /app/tart-vuer/package.json
COPY tart-vuer/pnpm-lock.yaml /app/tart-vuer/pnpm-lock.yaml
RUN mkdir -p /app/tart-vuer/pkg
RUN pnpm install --frozen-lockfile

# Quick rebuild after wasm imaging is added 
COPY --from=rust-build /app/rust/pkg /app/tart-vuer/pkg
RUN pnpm install --frozen-lockfile

COPY tart-vuer /app/tart-vuer

ARG CI_PROJECT_NAME
ENV CI_PROJECT_NAME=$CI_PROJECT_NAME

ARG CI_COMMIT_SHA
ENV CI_COMMIT_SHA=$CI_COMMIT_SHA

RUN pnpm build
RUN rm dist/js/*.map
RUN find ./dist -type f -regex '.*\.\(htm\|html\|txt\|text\|js\|css\)$' -exec gzip -f -k {} \;

# Serve static content

FROM nginx:1.21.6-alpine AS production-stage
COPY --from=node-build-stage /app/tart-vuer/dist /usr/share/nginx/html/viewer
EXPOSE 80
