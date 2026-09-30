/**
 * Benchmark satellite enrichment against chunk size.
 *
 * The viewer enriches a history in chunks of `batchSize` timestamps
 * (stores/app.js). Each chunk is one synchronous wasm call, so a chunk is also
 * one unbroken block on the main thread — the thing that drops frames. Smaller
 * chunks block for less, but `azElBulk` rebuilds the SGP4 constants for every
 * TLE on every call, so smaller chunks pay that more often.
 *
 * This measures both, with and without hoisting the propagator construction out
 * of the loop, to show what the chunk size actually costs.
 *
 * Needs the nodejs-target build:
 *   make build_wasm_node
 * Then:
 *   node scripts/benchmark-chunk-sizes.mjs [timestamps] [tles.json]
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const { CataloguePropagators } = require("../pkg-node/tart_catalogue_wasm.js");

const TOTAL = Number(process.argv[2] ?? 3600); // a full history
const TLE_FILE = process.argv[3] ?? "/tmp/eph.json";

const records = JSON.parse(readFileSync(TLE_FILE, "utf8"));
const TLE_JSON = JSON.stringify(records);

const LAT = -45.87;
const LON = 170.6;
const ALT = 100;
const MIN_EL = 0;

// One timestamp per minute of capture, like a real history.
const BASE = Math.floor(Date.now() / 1000);
const TIMES = Array.from({ length: TOTAL }, (_, i) => BASE + i * 60);

const CHUNK_SIZES = [5, 10, 20, 25, 50, 100, 200, 400];

/** Time one full pass of the history at a given chunk size. */
function run(chunkSize, { hoist }) {
  const chunkCount = Math.ceil(TOTAL / chunkSize);

  let shared = null;
  let buildMs = 0;
  if (hoist) {
    const t0 = performance.now();
    shared = new CataloguePropagators(TLE_JSON);
    buildMs = performance.now() - t0;
  }

  let totalMs = 0;
  let maxChunkMs = 0;
  let positions = 0;

  for (let offset = 0; offset < TOTAL; offset += chunkSize) {
    const times = TIMES.slice(offset, offset + chunkSize);

    const t0 = performance.now();
    const propagators = hoist ? shared : new CataloguePropagators(TLE_JSON);
    const rows = propagators.horizontal_positions_bulk(Float64Array.from(times), LAT, LON, ALT, MIN_EL);
    if (!hoist) propagators.free();
    const elapsed = performance.now() - t0;

    totalMs += elapsed;
    if (elapsed > maxChunkMs) maxChunkMs = elapsed;
    positions += rows.length;
  }

  if (shared) shared.free();

  return { chunkSize, chunkCount, totalMs, maxChunkMs, buildMs, positions };
}

const fmt = (n, w = 9) => n.toFixed(1).padStart(w);

for (const hoist of [false, true]) {
  console.log(
    `\n${hoist ? "WITH propagators hoisted (built once)" : "AS TODAY (propagators rebuilt per chunk)"}` +
      `  —  ${TOTAL} timestamps, ${records.length} TLEs`,
  );
  console.log("  chunk   chunks   total ms   build ms   max chunk ms   ms/position");
  console.log("  -----   ------   --------   --------   ------------   -----------");

  for (const chunkSize of CHUNK_SIZES) {
    const r = run(chunkSize, { hoist });
    // The build is inside the loop for the non-hoisted case, so it is already
    // part of the totals; report it separately only when it is hoisted.
    console.log(
      `  ${String(r.chunkSize).padStart(5)}   ${String(r.chunkCount).padStart(6)}   ` +
        `${fmt(r.totalMs)}   ${fmt(r.buildMs)}   ${fmt(r.maxChunkMs)}   ` +
        `${(r.totalMs / r.positions).toFixed(3).padStart(11)}`,
    );
  }
}

console.log(
  "\n  A chunk is one synchronous wasm call, so `max chunk ms` is also the longest\n" +
    "  unbroken block on the main thread. Browsers call anything over 50 ms a long task.",
);
