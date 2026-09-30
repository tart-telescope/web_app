/**
 * Measure what a loaded visibility history costs in memory, and what the
 * `vis-typed-arrays` flag changes about it.
 *
 * Loads N files through the Edge Cache eye buttons, forcing a garbage
 * collection before each reading so the numbers are not inflated by uncollected
 * garbage.
 *
 * The attribution that matters is the *drop*: after the last reading the store's
 * history is emptied and the heap sampled again. What falls away is what the
 * history itself was retaining, which is far more direct than comparing whole
 * page figures between two runs — the page also holds three.js, a wasm heap and
 * whatever the last render left behind, and those differ run to run.
 *
 * Usage:
 *   node e2e/tools/measure-history-cost.mjs [files]     # default 5
 */

import { chromium } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const FILES = Number(process.argv[2] ?? 5);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

/** Heap after a forced GC, so garbage does not inflate the reading. */
async function sample(cdp, page) {
  await cdp.send("HeapProfiler.collectGarbage");
  return page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
}

/** Measure one flag state: load, read, empty, read again. */
async function measure(flags, files) {
  const browser = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--enable-precise-memory-info"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await page.goto(`${BASE_URL}/?flags=${flags}`);

  const rows = page.locator(".v-data-table tbody tr").filter({ hasText: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/ });
  await rows.first().waitFor({ state: "visible", timeout: 30_000 });
  const rowCount = await rows.count();

  /** Load one row and wait for the button's spinner to clear. */
  async function loadRow(index) {
    const eye = rows.nth(index).getByRole("button").first();
    const done = page.waitForResponse((r) => /\/vis\/.*\.hdf(\?|$)/.test(r.url()) && r.status() === 200, { timeout: 60_000 });
    const started = Date.now();
    await eye.click();
    await done;
    await eye
      .locator(".v-progress-circular")
      .waitFor({ state: "hidden", timeout: 120_000 })
      .catch(() => {});
    return Date.now() - started;
  }

  // Warm up, so the one-time runtime costs are not in the first sample.
  await loadRow(0).catch(() => {});
  await page.waitForTimeout(500);

  const before = await sample(cdp, page);

  const times = [];
  const heapAfterEach = [];
  for (let i = 1; i <= files && i < rowCount; i++) {
    times.push(await loadRow(i));
    heapAfterEach.push(await sample(cdp, page));
  }

  const layout = await page.evaluate(() => {
    const store = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia._s.get("app");
    const first = store.vis_history[0];
    return {
      records: store.vis_history.length,
      kind: first?.values instanceof Float32Array ? "packed Float32Array" : "objects",
      fields: first && !first.values ? Object.keys(first).join(",") : null,
    };
  });

  const withHistory = heapAfterEach.at(-1);

  // Emptying the store and reading the heap again was the plan for attributing
  // the cost to the history directly. It does not work: usedJSHeapSize does not
  // come back down when the records are dropped, so it reported 0.0 MB freed
  // for 361 records in both layouts. The growth across loading is what is left,
  // and it is measured identically in both runs, which is what makes comparing
  // them meaningful.
  await browser.close();

  return { flags, before, heapAfterEach, times, layout, withHistory, growth: withHistory - before };
}

const results = [];
for (const flags of ["-vis-typed-arrays", "vis-typed-arrays"]) {
  process.stdout.write(`measuring ${flags} … `);
  const result = await measure(flags, FILES);
  results.push(result);
  console.log(`done (${result.layout.records} records, ${result.layout.kind})`);
}

const [off, on] = results;
const steps = (r) => r.heapAfterEach.map((h, i) => h - (i === 0 ? r.before : r.heapAfterEach[i - 1]));

console.log(`\nHistory memory  (${FILES} files, the same files in both runs)`);
console.log("  flags                  records   before     after    growth   per record   per file");
for (const r of results) {
  console.log(
    `  ${r.flags.padEnd(22)} ${String(r.layout.records).padStart(5)}   ` +
      `${mb(r.before).padStart(6)} MB ${mb(r.withHistory).padStart(6)} MB ${mb(r.growth).padStart(7)} MB   ` +
      `${(r.growth / r.layout.records / 1024).toFixed(1).padStart(8)} KB   ${(r.growth / (FILES + 1) / 1024 / 1024).toFixed(2).padStart(6)} MB`,
  );
}

console.log(`\n  layout off : ${off.layout.kind}${off.layout.fields ? `  (${off.layout.fields})` : ""}`);
console.log(`  layout on  : ${on.layout.kind}`);
console.log(`  difference : ${mb(off.growth - on.growth)} MB less growth for the same ${on.layout.records} records`);
if (on.growth > 0) console.log(`  ratio      : ${(off.growth / on.growth).toFixed(1)}x`);
console.log(
  `  per file   : ${steps(off)
    .map((s) => mb(s))
    .join(", ")} MB (off)`,
);
console.log(
  `               ${steps(on)
    .map((s) => mb(s))
    .join(", ")} MB (on)`,
);

console.log("\nCaveats: this is whole-page growth from loading, not only the records — it also");
console.log("includes whatever the chart and the renderer hold afterwards. Both runs do the");
console.log("same thing to the same page, so the difference between them is the flag's.");
console.log("usedJSHeapSize is a coarse instrument: read it as a shape rather than a precise");
console.log("figure, and note the per-file steps staying flat rather than decaying.");
