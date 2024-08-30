# Rust build stage
FROM rustlang/rust:nightly-slim AS rust-build
WORKDIR /app/rust
RUN apt-get update && apt-get install -y curl
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
COPY rust /app/rust
RUN RUST_LOG=info wasm-pack build --release --out-dir ./pkg

# Web App build stage
FROM node:20 AS node-build-stage
WORKDIR /app/tart-viewer
RUN npm install -g pnpm

# Install basic dependencies
COPY tart-viewer/package.json /app/tart-viewer/package.json
COPY tart-viewer/pnpm-lock.yaml /app/tart-viewer/pnpm-lock.yaml
RUN mkdir -p /app/tart-viewer/pkg
RUN pnpm install --frozen-lockfile

# Quick rebuild after wasm imaging is added
COPY --from=rust-build /app/rust/pkg /app/tart-viewer/pkg
RUN pnpm install --frozen-lockfile

COPY tart-viewer /app/tart-viewer

# if base url is not set. fallback to /
ARG BASE_URL
ENV BASE_URL=$BASE_URL

ARG CI_COMMIT_SHA
ENV CI_COMMIT_SHA=$CI_COMMIT_SHA
ENV VITE_COMMIT_SHA=$CI_COMMIT_SHA

RUN pnpm build --base=$BASE_URL/
# Compress static files
RUN find ./dist -type f -regex '.*\.\(htm\|html\|wasm\|eot\|ttf\|txt\|text\|js\|css\)$' -exec gzip -f --best -k {} \;


FROM jauderho/nginx-distroless:stable AS production-stage

ARG BASE_URL
ENV BASE_URL=$BASE_URL
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=node-build-stage /app/tart-viewer/dist /usr/share/nginx/html$BASE_URL/
EXPOSE 80
