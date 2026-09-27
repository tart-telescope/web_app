/**
 * Off-main-thread colour rendering.
 *
 * `get_color_bytes_only` is the whole cost of a hover: ~69 ms at nside 64 for
 * 24448 pixels, measured at ~2.8 us per visible pixel and essentially nothing
 * else. On the main thread that is one dropped frame per cursor position, and
 * it takes the tooltip, the chart cursor and the rest of the page down with it.
 *
 * The function is a pure `(json, nside) -> Uint8Array` with no DOM and no
 * state, and the array it returns is a fresh ArrayBuffer rather than a view
 * into the wasm heap — so the result can be transferred to the caller with no
 * copy. That makes this a clean boundary, and the only thing the worker has to
 * get right beyond calling the function is not building a backlog.
 *
 * A worker cannot be interrupted part-way through a call, so a fast hover would
 * otherwise queue one 69 ms render per cursor position. Instead a job replaces
 * whatever is pending and the loop re-reads it: a burst of cursor positions
 * collapses to at most two renders, the one already running and the newest.
 */

import init, { get_color_bytes_only, get_color_bytes_only_simd } from "gridless";
import wasmUrl from "gridless/gridlesslib_bg.wasm?url";

// Passed explicitly rather than left to the module's own fallback, which
// resolves the .wasm relative to its own import.meta.url — fine when the module
// is served from node_modules, not obviously fine once it is bundled into a
// worker chunk.
const ready = init(wasmUrl);

/** The newest job, or null. Overwritten by each message; never queued. */
let pending = null;
let draining = false;
let scheduled = false;

self.addEventListener("message", ({ data }) => {
  pending = data;
  schedule();
});

/**
 * Start a drain once the queued messages have been delivered.
 *
 * Starting one immediately from the message handler would defeat the
 * collapsing: a render blocks this thread for ~69 ms, so the cursor positions
 * sent during it sit in the event queue, not in `pending`, and the worker would
 * wake up and render each of them in turn. Yielding first lets those messages
 * land on `pending` and overwrite one another, so the burst costs one render
 * instead of one per position.
 */
function schedule() {
  if (draining || scheduled) return;
  scheduled = true;
  setTimeout(drain, 0);
}

async function drain() {
  scheduled = false;
  draining = true;
  try {
    await ready;
  } catch (error) {
    // Nothing can be rendered without the module. Tell the caller so it can
    // fall back rather than wait for a reply that will never come.
    self.postMessage({ id: pending?.id ?? -1, error: `gridless init failed: ${error?.message ?? error}` });
    draining = false;
    return;
  }

  while (pending) {
    const job = pending;
    pending = null;
    try {
      const bytes = job.simd ? get_color_bytes_only_simd(job.json, job.nside) : get_color_bytes_only(job.json, job.nside);
      self.postMessage({ id: job.id, bytes }, [bytes.buffer]);
    } catch (error) {
      // A malformed payload panics inside the wasm. Report it against this job
      // and keep the loop alive so the next one still gets a chance.
      self.postMessage({ id: job.id, error: String(error?.message ?? error) });
    }
  }

  draining = false;
}
