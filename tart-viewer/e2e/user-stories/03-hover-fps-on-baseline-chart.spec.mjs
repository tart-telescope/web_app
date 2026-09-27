import { expect, test } from "@playwright/test";
import { gotoApp, measureRowLoad, waitForEdgeCache } from "./support/edge-cache.mjs";
import { formatFrames, startFrameSampler, stopFrameSampler } from "./support/frames.mjs";

/**
 * User story: sweep the cursor across the amplitude/phase chart and see how
 * smooth the UI stays.
 *
 * Loads files from the Edge Cache, then moves the mouse left to right and back
 * across the chart that sits directly above the Baseline slider, sampling
 * `requestAnimationFrame` deltas the whole time.
 *
 * Why this is worth measuring: every cursor move over the chart is a real
 * update. `UPlotChart.vue` emits `mouse-move` from its uPlot `setCursor` hook,
 * `Baseline.vue` turns that into `setHoveredTimestamp` on the store, and the
 * store's `currentVisData` getter is what `Synthesis.vue` renders the 3D scene
 * from. So dragging the cursor across the plot re-derives and re-renders the
 * whole visibility scene once per cursor position — the one interaction where
 * the cost of the record layout is paid continuously rather than once.
 *
 * Three windows, because a bare FPS number says nothing on its own:
 *
 *   idle      - mouse parked, no input at all
 *   off-chart - the same sweep across the app bar: the cost of the automation
 *               sending mouse events, with none of the app's hover work
 *   on-chart  - the same sweep across the plot: input plus hover work
 *
 * The gap between off-chart and on-chart is what the hover handler costs. The
 * gap between idle and off-chart is the automation's own overhead, and its size
 * is the reason all three are reported rather than comparing against a
 * theoretical 60.
 *
 * Each window runs a full sweep and repeats it until its budget is spent, so a
 * loaded window overruns its budget — the on-chart window is typically twice
 * the others. That is the point: frames stop arriving, and the extra wall time
 * is exactly what the frame rate fell by.
 *
 * Caveat: `swiftshader` is doing the compositing in this configuration, so the
 * absolute ceiling is not a real browser's. The frame *deltas* are still
 * meaningful — they measure main-thread saturation, which is where this cost
 * lives — but run `pnpm test:e2e --headed` for a figure that resembles a desk
 * browser.
 *
 * The viewport is enlarged so the whole Baseline card is on screen; at the
 * default 720 px the chart is below the fold.
 */

test.use({ viewport: { width: 1440, height: 1080 } });

// Three files is ~180 records, plenty for the rates below, and a third less
// HDF5 parsing and chart work than five.
const FILES = Number(process.env.E2E_FILES ?? 3);
// This story is the expensive one by construction: it holds the cursor over the
// chart and keeps it moving, so every sample is a real render — and headless
// Chromium software-renders the whole scene. Two seconds is ~120 frames, enough
// for the medians to settle, at two thirds of the cost of three.
const WINDOW_MS = Number(process.env.E2E_WINDOW_MS ?? 2000);
const WARMUP_MS = Number(process.env.E2E_WARMUP_MS ?? 500);
// Events per mouse.move call, which is also how often the sweep checks whether
// its budget is spent. At 40 the check came once per 80 events — and with the
// colour worker off a frame is ~70 ms, so a pair takes over five seconds and a
// two-second window ran for seventeen. Each of those is a real render, so the
// overshoot was most of this story's cost.
const SWEEP_STEPS = Number(process.env.E2E_SWEEP_STEPS ?? 10);

/**
 * The uPlot *plot area* — the `.u-over` overlay — of the chart immediately
 * above the Baseline range slider.
 *
 * The overlay, not the `.u-wrap` around it: the wrap includes the axes, and a
 * cursor parked on an axis resolves to no data index at all, which uPlot
 * reports as a leave. Sweeping the wrap's full width therefore ends by clearing
 * the very hover the test is trying to produce.
 *
 * Both the amplitude and the phase plot share one hover handler, so which one
 * is picked does not change the measurement; picking by geometry rather than by
 * index means a layout change cannot silently start hovering something else.
 *
 * The locator is resolved anew on every use — uPlot replaces the overlay
 * whenever the chart re-renders, so a handle taken once does not survive a
 * single hover.
 */
async function plotAboveSlider(page) {
  const index = await page.evaluate(() => {
    const plots = [...document.querySelectorAll(".u-over")];
    if (plots.length === 0) return -1;

    const slider = document.querySelector(".v-range-slider");
    if (!slider) return plots.length - 1;

    const sliderTop = slider.getBoundingClientRect().top;
    let best = -1;
    let bestGap = Infinity;
    for (const [i, plot] of plots.entries()) {
      const gap = sliderTop - plot.getBoundingClientRect().bottom;
      if (gap >= -1 && gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    return best === -1 ? plots.length - 1 : best;
  });

  expect(index, "no uPlot plot area found on the page").toBeGreaterThanOrEqual(0);
  return page.locator(".u-over").nth(index);
}

/** Move the cursor back and forth across a horizontal span for `ms`. */
async function sweep(page, y, x0, x1, ms) {
  await page.mouse.move(x0, y);
  const started = Date.now();
  while (Date.now() - started < ms) {
    await page.mouse.move(x1, y, { steps: SWEEP_STEPS });
    await page.mouse.move(x0, y, { steps: SWEEP_STEPS });
  }
}

test("sweep the cursor across the baseline chart", async ({ page }) => {
  await gotoApp(page);

  const rowCount = await waitForEdgeCache(page);
  expect(rowCount, "need files in the edge cache to chart").toBeGreaterThan(0);
  const toLoad = Math.min(FILES, rowCount);
  for (let i = 0; i < toLoad; i++) {
    await measureRowLoad(page, i);
  }

  const plot = await plotAboveSlider(page);

  // What the cursor resolved to, read from the store rather than from the
  // tooltip element. The tooltip is created and destroyed as the cursor moves,
  // so it can vanish between checking it is visible and reading its text — the
  // read then waits forever for an element only a mouse move would bring back.
  const hoveredAt = () =>
    page.evaluate(() => {
      const store = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia._s.get("app");
      return store.hoveredTimestamp ? new Date(store.hoveredTimestamp).toISOString() : null;
    });
  const geometry = async () => {
    // uPlot replaces its overlay whenever the chart re-renders, so the handle
    // can be detached for a frame. Wait for it rather than failing the run on
    // a race — this is the same replacement that makes the sampler take
    // coordinates instead of an element.
    await plot.waitFor({ state: "visible", timeout: 10_000 });
    const box = await plot.boundingBox();
    expect(box, "the plot has no box").not.toBeNull();
    return {
      ...box,
      // A small inset from the plot's own edges, to stay clear of the boundary
      // where the cursor stops resolving to an index.
      left: box.x + box.width * 0.05,
      right: box.x + box.width * 0.95,
      middle: box.y + box.height / 2,
    };
  };

  // A first pass warms whatever is lazy on the first hover (the tooltip, the
  // store getter, any wasm hand-off), so the measured window is steady state.
  let box = await geometry();
  await sweep(page, box.middle, box.left, box.right, WARMUP_MS);
  await expect.poll(hoveredAt, { message: "nothing resolved while hovering the left of the chart" }).not.toBeNull();
  const hoveredLeft = await hoveredAt();

  // 1. Idle: no input at all.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  await startFrameSampler(page);
  await page.waitForTimeout(WINDOW_MS);
  const idle = await stopFrameSampler(page);

  // 2. Off-chart: the same sweep, over the app bar, dispatching just as many
  //    mouse events but touching no visibility data.
  await startFrameSampler(page);
  await sweep(page, 8, box.left, box.right, WINDOW_MS);
  const offChart = await stopFrameSampler(page);

  // 3. On-chart: the measurement this story exists for. The geometry is read
  //    again here — the plot is a live element and its box is what the sampler
  //    counts events against.
  box = await geometry();

  // With the colour worker on, count the colour maps that actually reach the
  // sphere. The frame rate alone cannot see the failure this guards: dropping
  // every result as superseded still produces perfect frames, a perfectly
  // valid render, and a sphere that never changes until the pointer stops.
  const renderedBefore = await page.evaluate(() => globalThis.colorRenderApplied ?? 0);

  await startFrameSampler(page, box);
  await sweep(page, box.middle, box.left, box.right, WINDOW_MS);
  const onChart = await stopFrameSampler(page);

  const rendered = await page.evaluate(() => ({
    workerActive: globalThis.colorWorkerActive === true,
    count: globalThis.colorRenderApplied ?? 0,
  }));
  const updatesDuringSweep = rendered.count - renderedBefore;

  // The cursor resolving to a different point at the far end proves the sweep
  // traversed the plot rather than sitting on one spot.
  await page.mouse.move(box.right, box.middle);
  await expect.poll(hoveredAt, { message: "nothing resolved while hovering the right of the chart" }).not.toBeNull();
  const hoveredRight = await hoveredAt();

  const hoverCost = offChart.fps - onChart.fps;
  const lines = [
    `files loaded             : ${toLoad}`,
    `plot area                : ${Math.round(box.width)}x${Math.round(box.height)} at (${Math.round(box.x)}, ${Math.round(box.y)})`,
    ``,
    formatFrames("idle", idle),
    formatFrames("off-chart sweep", offChart),
    formatFrames("on-chart sweep", onChart),
    ``,
    `hover cost               : ${hoverCost.toFixed(1)} fps below the same sweep without hover`,
    `mouse events on the plot : ${onChart.moves}`,
    `sphere re-rendered       : ${rendered.workerActive ? `${updatesDuringSweep} times during the sweep` : "n/a (colour worker off)"}`,
    `blocked on-chart         : ${onChart.loafBlockingMs.toFixed(0)} ms of ${Math.round(onChart.durationMs)} ms ` +
      `(${((onChart.loafBlockingMs / onChart.durationMs) * 100).toFixed(0)}% of the window)`,
  ];
  console.log("\n" + lines.join("\n") + "\n");

  test.info().annotations.push({
    type: "measurement",
    description:
      `idle ${idle.fps.toFixed(1)} fps / off-chart ${offChart.fps.toFixed(1)} / ` +
      `on-chart ${onChart.fps.toFixed(1)} fps (${toLoad} files, ${WINDOW_MS} ms windows)`,
  });

  // Behavioural guards, not performance assertions: the hover must have
  // happened, and must have resolved to more than one point on the plot.
  expect(onChart.frameCount, "no frames were sampled — the page was not rendering").toBeGreaterThan(10);
  expect(onChart.moves, "no mouse events reached the plot").toBeGreaterThan(0);
  expect(hoveredLeft, "the cursor resolved to the same point across the whole sweep").not.toBe(hoveredRight);

  // The sphere must keep up with the pointer, not just catch up when it stops.
  // One render is ~69 ms, so a 3 s sweep that applies only one or two colour
  // maps is the frozen-image bug rather than a slow machine.
  if (rendered.workerActive) {
    expect(updatesDuringSweep, "the sphere stopped updating while the pointer was moving").toBeGreaterThan(5);
  }
});
