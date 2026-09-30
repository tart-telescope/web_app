/**
 * Trailing-edge coalescer.
 *
 * Collapses a burst of `schedule()` calls into at most one `flush()` per
 * `delayMs`. The first call in a window arms the timer; further calls are
 * absorbed until it fires.
 *
 * `flushNow()` exists because coalescing is only safe if the final write is
 * guaranteed: always call it when the producing work finishes, so the last
 * burst is never left sitting in the timer when the operation ends.
 *
 * @param {() => void} flush - work to run, at most once per window
 * @param {number} [delayMs] - coalescing window
 * @returns {{ schedule: () => void, flushNow: () => void, cancel: () => void }}
 */
export function createCoalescer(flush, delayMs = 250) {
  let timer = null;
  let pending = false;

  function run() {
    timer = null;
    if (!pending) return;
    pending = false;
    flush();
  }

  return {
    /** Mark work pending, arming a flush if one is not already scheduled. */
    schedule() {
      pending = true;
      if (timer === null) {
        timer = setTimeout(run, delayMs);
      }
    },

    /** Flush immediately if anything is pending. Safe to call when idle. */
    flushNow() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pending) return;
      pending = false;
      flush();
    },

    /** Drop pending work without flushing. */
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = false;
    },
  };
}
