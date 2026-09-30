import { expect, test } from "@playwright/test";
import { gotoApp, measureRowLoad, waitForEdgeCache } from "./support/edge-cache.mjs";

/**
 * User story: load a visibility file from the Edge Cache.
 *
 * A user opens the Edge Cache panel, picks a visibility, and clicks the eye
 * button to load it. We measure from the click until the action is finished,
 * which the UI signals by clearing the button's loading spinner (RecentData.vue
 * holds `loadingFile` for the whole of `loadVisibilityFile()` and clears it in
 * a `finally`).
 *
 * This is the *steady state* figure. The one-time costs — wasm init, first
 * synthesis render, sphere geometry, shader compilation — belong to story 00
 * and are paid by a warm-up load here, whose number is printed for contrast but
 * not asserted on. Without the warm-up this story would report roughly double.
 */

const WARMUP_ROW = 0;
const MEASURED_ROW = Number(process.env.E2E_ROW_INDEX ?? 1);

test("load a visibility from the edge cache", async ({ page }) => {
  await gotoApp(page);

  const rowCount = await waitForEdgeCache(page);
  expect(rowCount, "need at least two rows: one to warm up on, one to measure").toBeGreaterThan(1);
  expect(MEASURED_ROW, `E2E_ROW_INDEX ${MEASURED_ROW} is out of range`).toBeLessThan(rowCount);

  // Pay the one-time costs so the measured load reflects steady state.
  const warmup = await measureRowLoad(page, WARMUP_ROW);

  const load = await measureRowLoad(page, MEASURED_ROW);

  const lines = [
    `rows                     : ${rowCount}`,
    `warm-up load (discarded) : ${warmup.toFinish} ms  (${warmup.file})`,
    `measured row             : #${MEASURED_ROW}  (${load.file})`,
    `click -> file fetched    : ${load.toFetch} ms`,
    `click -> action finished : ${load.toFinish} ms`,
  ];
  console.log("\n" + lines.join("\n") + "\n");

  test.info().annotations.push({
    type: "measurement",
    description: `steady state click->finish ${load.toFinish} ms (fetch ${load.toFetch} ms)`,
  });

  expect(load.toFinish).toBeGreaterThan(0);
});
