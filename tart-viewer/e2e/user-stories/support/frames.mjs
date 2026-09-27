/**
 * Frame-timing sampler, run inside the page.
 *
 * `requestAnimationFrame` deltas are the honest measure of "is the UI smooth
 * while I do this": a frame that takes 40 ms to produce stretches the next
 * delta to 40 ms whatever the cause, and it is the only signal the user
 * actually perceives. A long-task observer is collected alongside it because it
 * attributes the stretch — a dropped frame means "the main thread was busy",
 * and the blocking duration says by how much.
 *
 * Everything is computed in-page and only the summary crosses the bridge, so a
 * window with a few hundred frames does not fill the test output with numbers.
 */

/**
 * Begin sampling. Returns once the sampler is installed and running.
 *
 * @param {import("@playwright/test").Page} page
 * @param {{x:number,y:number,width:number,height:number}} [area] region whose
 *   mouse events are counted, as a sanity check that the input the test is
 *   sending actually arrived. An area, deliberately not a selector: uPlot
 *   replaces its overlay whenever the chart re-renders, so an element reference
 *   goes stale exactly when the test starts hovering. A capture-phase listener
 *   on the window does the counting, because a listener on the element the
 *   events appear to land on can never be reached.
 */
export async function startFrameSampler(page, area) {
  await page.evaluate((box) => {
    const state = { deltas: [], longTasks: [], loaf: [], moves: 0, t0: 0, raf: 0, observers: [] };
    window.__frames = state;

    if (box) {
      const { x, y, width, height } = box;
      const onMove = (event) => {
        const { clientX: cx, clientY: cy } = event;
        if (cx >= x && cx <= x + width && cy >= y && cy <= y + height) {
          state.moves += 1;
        }
      };
      window.addEventListener("mousemove", onMove, { capture: true, passive: true });
      state.detach = () => window.removeEventListener("mousemove", onMove, { capture: true });
    }

    let last = performance.now();
    state.t0 = last;
    const tick = (now) => {
      state.deltas.push(now - last);
      last = now;
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);

    // long-animation-frame is the newer, more useful signal (it carries
    // blockingDuration); longtask is the older one. Neither is guaranteed to
    // exist, and an unsupported type makes observe() throw, so they are
    // registered separately and their absence is not an error.
    for (const type of ["longtask", "long-animation-frame"]) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (type === "longtask") {
              state.longTasks.push(entry.duration);
            } else {
              state.loaf.push({ duration: entry.duration, blocking: entry.blockingDuration ?? 0 });
            }
          }
        });
        observer.observe({ type, buffered: false });
        state.observers.push(observer);
      } catch {
        // Not supported in this Chromium.
      }
    }
  }, area);
}

/**
 * Stop sampling and return the summary.
 *
 * The window is wall-clock, so `fps` is the rate actually achieved — if the
 * main thread stalls, frames stop arriving and the average falls. A near-zero
 * frame count means the page was not rendering at all (a hidden page stops
 * rAF entirely), which is a broken measurement rather than a fast one.
 *
 * @returns {Promise<object>} timing summary
 */
export async function stopFrameSampler(page) {
  return page.evaluate(() => {
    const state = window.__frames;
    cancelAnimationFrame(state.raf);
    for (const observer of state.observers) observer.disconnect();
    state.detach?.();
    const end = performance.now();
    delete window.__frames;

    const { deltas } = state;
    const sorted = deltas.toSorted((a, b) => a - b);
    const quantile = (q) => (sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
    const durationMs = end - state.t0;
    const frameTotal = deltas.reduce((a, b) => a + b, 0);

    return {
      durationMs,
      frameCount: deltas.length,
      fps: durationMs > 0 ? (deltas.length / durationMs) * 1000 : 0,
      meanFrameMs: deltas.length > 0 ? frameTotal / deltas.length : 0,
      medianFrameMs: quantile(0.5),
      p95FrameMs: quantile(0.95),
      maxFrameMs: sorted.at(-1) ?? 0,
      // A frame budget of 60 Hz is 16.7 ms; half again over that is a frame the
      // user can see slip.
      slowFrames: deltas.filter((d) => d > 16.7 * 1.5).length,
      verySlowFrames: deltas.filter((d) => d > 50).length,
      longTaskCount: state.longTasks.length,
      longTaskMs: state.longTasks.reduce((a, b) => a + b, 0),
      maxLongTaskMs: state.longTasks.length > 0 ? Math.max(...state.longTasks) : 0,
      loafCount: state.loaf.length,
      loafBlockingMs: state.loaf.reduce((a, b) => a + b.blocking, 0),
      moves: state.moves,
    };
  });
}

/** One line per window, in the same shape as the other stories' output. */
export function formatFrames(label, s, width = 22) {
  return [
    `${label.padEnd(width)}: ${s.fps.toFixed(1).padStart(5)} fps  ` + `(${s.frameCount} frames / ${Math.round(s.durationMs)} ms)`,
    `${"".padEnd(width)}  frame ms  med ${s.medianFrameMs.toFixed(1).padStart(5)}  ` +
      `p95 ${s.p95FrameMs.toFixed(1).padStart(6)}  max ${s.maxFrameMs.toFixed(1).padStart(6)}`,
    `${"".padEnd(width)}  over 25 ms: ${s.slowFrames}/${s.frameCount} frames  ` +
      `(over 50 ms: ${s.verySlowFrames})  blocked ${s.loafBlockingMs.toFixed(0)} ms in ${s.loafCount} long frames`,
  ].join("\n");
}
