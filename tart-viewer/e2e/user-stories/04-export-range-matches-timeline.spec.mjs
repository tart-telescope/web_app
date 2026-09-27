import { expect, test } from "@playwright/test";
import { gotoApp, measureRowLoad, waitForEdgeCache } from "./support/edge-cache.mjs";
import { doubleClickReset, dragZoom, rangesMatch, zoomState } from "./support/zoom-range.mjs";

/**
 * User story: an MP4 export covers the slice of the timeline that is selected.
 *
 * The recorder does not read the chart. It filters `vis_history` by
 * `store.currentZoomRange`, which was written only from uPlot's `setSelect`
 * hook. Plenty of things move the chart's x scale without ever making a
 * selection — most visibly a double-click, which `dblClick` implements as
 * `autoScaleX()`: the timeline snaps back to the full range and nothing tells
 * the store. The export then covered the last selection while the user was
 * looking at the whole history.
 *
 * So this asserts the two agree after each way of moving the range, and
 * reports how many frames an export would actually contain.
 */

const FILES = Number(process.env.E2E_FILES ?? 5);

test("the export range follows the timeline", async ({ page }) => {
  await gotoApp(page);

  const rowCount = await waitForEdgeCache(page);
  const toLoad = Math.min(FILES, rowCount);
  for (let i = 0; i < toLoad; i++) {
    await measureRowLoad(page, i);
  }

  const report = [];
  const record = async (label) => {
    const state = await zoomState(page);
    report.push({ label, ...state, match: rangesMatch(state) });
    return state;
  };

  const initial = await record("initial");
  expect(initial.chart, "no chart found — the uPlot component tree changed").not.toBeNull();
  expect(initial.totalRecords).toBeGreaterThan(0);

  // The frame counts carry the assertions rather than the raw ranges: an
  // unzoomed chart reports no range at all, which is "everything" rather than
  // a disagreement, and comparing the two ranges directly cannot tell those
  // apart. What the user can actually observe is which frames get exported.
  expect(initial.exportFrames, "an unzoomed chart must export the whole history").toBe(initial.totalRecords);

  await dragZoom(page, 0.3, 0.7);
  await page.waitForTimeout(600);
  const zoomed = await record("drag to zoom");
  expect(rangesMatch(zoomed), "the export range did not follow the selection").toBe(true);
  // The middle 40% must export a proper subset, not everything.
  expect(zoomed.exportFrames).toBeGreaterThan(0);
  expect(zoomed.exportFrames).toBeLessThan(zoomed.totalRecords);

  // The regression: uPlot resets the range here without firing setSelect, so
  // the chart snaps back to the full history and the recorder does not.
  await doubleClickReset(page);
  await page.waitForTimeout(600);
  const reset = await record("double-click reset");
  expect(reset.exportFrames, "double-click reset the chart but not the export range").toBe(reset.totalRecords);
  expect(rangesMatch(reset), "the chart and the recorder disagreed after a reset").toBe(true);

  // ...and the export must be able to take its snapshot. It could not on this
  // path: structuredClone refuses a Vue reactive proxy, and the recorder is
  // handed the store's array as-is when nothing is filtered out. The export
  // therefore failed precisely when the whole history was selected, which is
  // where every reset-zoom-then-export ends up. Taking the snapshot directly
  // keeps this cheap — actually recording the MP4 takes minutes.
  const snapshot = await page.evaluate(async () => {
    const { RecorderUtils } = await import("/src/services/videoRecorder/index.js");
    const store = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia._s.get("app");
    try {
      return { ok: true, frames: RecorderUtils.createDataSnapshot(store.vis_history).length };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  expect(snapshot.ok, `the export could not snapshot the history: ${snapshot.error}`).toBe(true);
  expect(snapshot.frames).toBe(reset.totalRecords);

  // The reset must survive more data arriving. Loading a file re-ranges the
  // chart, and the restore target used to be re-applied afterwards — zooming
  // the chart back in, undoing the reset, and leaving the recorder filtering by
  // a range that was no longer on screen. Live data does the same thing
  // continuously, which is how this presented: full range on screen, a
  // fraction of it in the export.
  if (rowCount > toLoad) {
    await measureRowLoad(page, toLoad);
    await page.waitForTimeout(1000);
    const afterData = await record("after new data");
    expect(afterData.exportFrames, "new data re-applied the zoom the reset had cleared").toBe(afterData.totalRecords);
    expect(rangesMatch(afterData), "the chart and the recorder disagreed after new data").toBe(true);
  }

  expect(
    report.some((r) => r.label === "after new data"),
    "not enough edge cache rows to load one more",
  ).toBe(rowCount > toLoad);

  const lines = report.map(
    (r) =>
      `${r.label.padEnd(20)} chart[${Math.round(r.chart.min)},${Math.round(r.chart.max)}]  ` +
      `export ${r.exportFrames}/${r.totalRecords} frames  ${r.match ? "in step" : "MISMATCH"}`,
  );
  console.log("\n" + lines.join("\n") + "\n");

  test.info().annotations.push({
    type: "measurement",
    description: `export frames: initial ${initial.exportFrames}/${initial.totalRecords}, zoomed ${zoomed.exportFrames}, reset ${reset.exportFrames}`,
  });
});
