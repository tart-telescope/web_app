/**
 * Main-thread side of the colour render worker.
 *
 * One call site: hand over the render payload, await the colour bytes. Whether
 * that happens in a worker or on the main thread is this module's business, so
 * the caller does not branch on the flag.
 *
 * Staleness is the other half of the job. Cursor positions arrive faster than
 * they can be rendered, and only the newest is ever displayed — so a result
 * whose request has been superseded resolves to `null` and the caller drops it,
 * rather than painting a colour map for a cursor position the pointer has
 * already left.
 *
 * If the worker cannot start (no module workers, a CSP that forbids it, a wasm
 * that will not instantiate), it is abandoned for the session and every later
 * call renders synchronously on the main thread. Slower, but the same pixels.
 */

import { get_color_bytes_only, get_color_bytes_only_simd } from "gridless";
import { isEnabled } from "@/utils/flags";

const FLAG = "color-worker";

let worker = null;
let abandoned = false;
let nextId = 0;
let newestId = 0;

/** id -> { resolve, reject } for requests the worker has not answered yet. */
const waiting = new Map();

function computeOnMainThread(json, nside, simd) {
  return simd ? get_color_bytes_only_simd(json, nside) : get_color_bytes_only(json, nside);
}

/**
 * Mirror the worker's state onto the global, following the convention the
 * other background runtimes already use (window.h5wasmWarm,
 * window.catalogueWasmReady). Without it the only way to tell whether a run
 * fell back is to read the console, and a module instance imported from a test
 * is not the app's — Vite serves it under a different URL.
 */
function publish() {
  globalThis.colorWorkerActive = colorWorkerActive();
}

function abandon(error) {
  abandoned = true;
  for (const entry of waiting.values()) entry.reject(error);
  waiting.clear();
  worker?.terminate();
  worker = null;
  publish();
}

function ensureWorker() {
  if (worker || abandoned) return worker;

  let created;
  try {
    created = new Worker(new URL("../workers/colorWorker.js", import.meta.url), { type: "module" });
  } catch (error) {
    // The constructor throws when module workers are unavailable or a CSP
    // forbids them. That is a fallback, not a failure.
    abandon(error);
    return null;
  }

  created.addEventListener("message", ({ data }) => {
    const entry = waiting.get(data.id);
    if (!entry) return;
    waiting.delete(data.id);
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.bytes);
  });

  created.addEventListener("error", (event) => {
    abandon(new Error(`colour worker failed: ${event.message ?? "unknown"}`));
  });

  worker = created;
  publish();
  return worker;
}

/**
 * Start the worker and its wasm now, so the first hover does not pay for it.
 * Called from the background warm-up, never on the render path.
 *
 * @returns {boolean} whether a worker was started
 */
export function warmColorWorker() {
  if (!isEnabled(FLAG)) return false;
  return ensureWorker() !== null;
}

/**
 * Colour bytes for one render payload.
 *
 * @param {string} json the payload, already serialised
 * @param {number} nside
 * @param {boolean} simd
 * @returns {Promise<Uint8Array|null>} null when a newer request has already
 *   superseded this one, in which case the caller must not use it
 */
export async function requestColorBytes(json, nside, simd) {
  if (!isEnabled(FLAG) || abandoned || !ensureWorker()) {
    return computeOnMainThread(json, nside, simd);
  }

  const id = ++nextId;
  newestId = id;

  try {
    const bytes = await new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, json, nside, simd });
    });
    return id === newestId ? bytes : null;
  } catch {
    // The worker died or refused the job; the sync path answers this one and
    // every subsequent one.
    return computeOnMainThread(json, nside, simd);
  }
}

/**
 * True while rendering actually happens off the main thread, for diagnostics.
 *
 * Checks that a worker exists, not just that the flag is on: the flag alone
 * reports "active" for a worker that was never started, which is exactly the
 * case a fallback test needs to tell apart.
 */
export function colorWorkerActive() {
  return isEnabled(FLAG) && !abandoned && worker !== null;
}
