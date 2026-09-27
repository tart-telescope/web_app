import { expect, test } from "@playwright/test";
import { edgeCacheRows, measureRowLoad, waitForEdgeCache } from "./support/edge-cache.mjs";

/**
 * User story: change which baseline the amplitude/phase chart is showing.
 *
 * Drags the two thumbs of the Baseline range slider from [0, 23] to [4, 10] and
 * times it until the UI settles.
 *
 * This exists for two reasons. It measures how the chart's cost varies with the
 * selection — `filteredData` scans each record with
 * `.find(x => x.i === i && x.j === j)`, so a pair further along the baseline
 * array costs more, and [4, 10] sits about 4x deeper than [0, 23]. And it is
 * the correctness guard for any change to how the visibility records are
 * stored: if that layout changes, this is the thing most likely to break
 * silently.
 *
 * The fine-grained CPU attribution lives in
 * `tools/profile-baseline-slider.mjs`.
 */

const FILES = Number(process.env.E2E_FILES ?? 4);
const DEFAULT_SELECTION = [0, 23];
const TARGET_SELECTION = [4, 10];

test("change the baseline selection", async ({ page }) => {
  await page.goto("/");

  const rowCount = await waitForEdgeCache(page);
  const toLoad = Math.min(FILES, rowCount);

  // A history worth charting: the scan cost grows with the number of records.
  for (let i = 0; i < toLoad; i++) {
    await measureRowLoad(page, i);
  }

  const slider = page.locator(".v-range-slider");
  await expect(slider).toBeVisible();

  /** The range slider mirrors its value into hidden text inputs. */
  const selection = () => page.evaluate(() => [...document.querySelectorAll(".v-range-slider input")].map((i) => Number(i.value)));

  expect(await selection()).toEqual(DEFAULT_SELECTION);
  await expect(edgeCacheRows(page).first()).toBeVisible();

  const thumbLow = page.locator(".v-range-slider .v-slider-thumb").nth(0);
  const thumbHigh = page.locator(".v-range-slider .v-slider-thumb").nth(1);

  const started = Date.now();
  for (let i = 0; i < DEFAULT_SELECTION[1] - TARGET_SELECTION[1]; i++) {
    await thumbHigh.press("ArrowLeft");
  }
  for (let i = 0; i < TARGET_SELECTION[0] - DEFAULT_SELECTION[0]; i++) {
    await thumbLow.press("ArrowRight");
  }
  // Two frames is the usual stand-in for "painted".
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const settledMs = Date.now() - started;

  const moved = await selection();
  console.log(`\nbaseline selection : ${JSON.stringify(moved)}  (was ${JSON.stringify(DEFAULT_SELECTION)})`);
  console.log(`records loaded     : ${toLoad} files`);
  console.log(`move -> settled    : ${settledMs} ms`);
  console.log(
    `moves              : ${DEFAULT_SELECTION[1] - TARGET_SELECTION[1] + (TARGET_SELECTION[0] - DEFAULT_SELECTION[0])} keypresses\n`,
  );

  test.info().annotations.push({
    type: "measurement",
    description: `baseline ${JSON.stringify(DEFAULT_SELECTION)} -> ${JSON.stringify(moved)} settled in ${settledMs} ms`,
  });

  // The guard that matters: the selection actually moved, in both thumbs.
  expect(moved).toEqual(TARGET_SELECTION);
});
