import { expect, test } from "@playwright/test";
import { gotoApp, measureRowLoad, waitForEdgeCache } from "./support/edge-cache.mjs";

/**
 * User story: a user opens the viewer for the first time and loads a file.
 *
 * This story owns everything that happens exactly once per page load: bundle
 * evaluation, the wasm modules initialising, the first synthesis render, sphere
 * geometry construction and shader compilation. Loading a visibility here is
 * therefore the *cold* path, and its number is much larger than story 01's.
 *
 * Keeping the one-time cost here is the point. Folded into story 01 it would
 * make the steady-state figure look far worse than it is, and hide a real
 * regression in either path behind the other.
 */

const ROW_INDEX = Number(process.env.E2E_ROW_INDEX ?? 0);

test("page load, then the first visibility", async ({ page }) => {
  // Intercept the readiness flags so we record when they actually flip rather
  // than when we happen to poll them.
  await page.addInitScript(() => {
    window.__marks = {};
    for (const [prop, mark] of [
      ["wasmReady", "gridlessWasm"],
      ["catalogueWasmReady", "catalogueWasm"],
      ["h5wasmWarm", "h5wasmWarm"],
    ]) {
      let value = false;
      Object.defineProperty(window, prop, {
        configurable: true,
        get: () => value,
        set: (next) => {
          if (next && !value) window.__marks[mark] = performance.now();
          value = next;
        },
      });
    }
  });

  await gotoApp(page, { waitUntil: "commit" });

  // App usable: the Edge Cache has real rows. Returns the page-relative time at
  // which that became true.
  const rowsAt = await page
    .waitForFunction(
      () => {
        const hasData = [...document.querySelectorAll(".v-data-table tbody tr")].some((r) =>
          /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(r.textContent || ""),
        );
        return hasData ? performance.now() : false;
      },
      { timeout: 60_000 },
    )
    .then((h) => h.jsonValue());

  const rowCount = await waitForEdgeCache(page);

  // The HDF5 runtime warms in the background after first paint, so give it a
  // bounded chance to land: a real user reads the page before clicking, and
  // that is precisely the window the warm-up exists to use. The result is
  // reported either way, so a warm-up that stops working is visible rather
  // than silently costing the click.
  const warmedInTime = await page
    .waitForFunction(() => window.__marks.h5wasmWarm !== undefined, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  const marks = await page.evaluate(() => ({ ...window.__marks }));

  // The cold load: first synthesis render, sphere geometry, shaders.
  const load = await measureRowLoad(page, ROW_INDEX);

  const fmt = (v) => (v === undefined ? "not set" : `${Math.round(v)} ms`);
  const lines = [
    `rows                    : ${rowCount}`,
    `nav -> gridless wasm    : ${fmt(marks.gridlessWasm)}`,
    `nav -> catalogue wasm   : ${fmt(marks.catalogueWasm)}`,
    `nav -> app usable       : ${fmt(rowsAt)}`,
    `nav -> HDF5 runtime warm: ${fmt(marks.h5wasmWarm)}${warmedInTime ? "" : "  (did not finish in time)"}`,
    `first load: click -> fetched : ${load.toFetch} ms`,
    `first load: click -> finished: ${load.toFinish} ms`,
    `first load: file        : ${load.file}`,
  ];
  console.log("\n" + lines.join("\n") + "\n");

  test.info().annotations.push({
    type: "measurement",
    description: `first load click->finish ${load.toFinish} ms; app usable at ${Math.round(rowsAt)} ms`,
  });

  expect(load.toFinish).toBeGreaterThan(0);
});
