/**
 * Measure what a loaded visibility history costs in memory, so claims about
 * changing its representation can be checked rather than assumed.
 *
 * Loads N files through the Edge Cache eye buttons, forcing a garbage
 * collection before each reading so the numbers are not inflated by uncollected
 * garbage.
 *
 * Usage:
 *   node e2e/tools/measure-history-cost.mjs [files]
 */

import { chromium } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const FILES = Number(process.argv[2] ?? 6);
const TARGET_RECORDS = 3600; // the store's cap, see app.js

const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader", "--enable-precise-memory-info"],
});
const context = await browser.newContext();
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await page.goto(BASE_URL);

const rows = page.locator(".v-data-table tbody tr").filter({ hasText: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/ });
await rows.first().waitFor({ state: "visible", timeout: 30_000 });
const rowCount = await rows.count();

/** Heap after a forced GC, so garbage does not inflate the reading. */
async function sample() {
  await cdp.send("HeapProfiler.collectGarbage");
  return page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
}

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

// Warm up so the one-time runtime costs are not in the first sample.
await loadRow(0).catch(() => {});
await page.waitForTimeout(500);

const before = await sample();

const times = [];
const heapAfterEach = [];
for (let i = 1; i <= FILES && i < rowCount; i++) {
  times.push(await loadRow(i));
  heapAfterEach.push(await sample());
}

await browser.close();

const mb = (b) => (b / 1024 / 1024).toFixed(1);
const RECORDS_PER_FILE = 60; // one per minute of capture, at decimation 1

// Marginal cost matters more than the total: a constant step per file means the
// records; a decaying one means one-time caches that stop growing.
const steps = heapAfterEach.map((h, i) => h - (i === 0 ? before : heapAfterEach[i - 1]));

console.log(`\nHistory cost  (${times.length} files loaded)`);
console.log(`  heap before        : ${mb(before)} MB`);
console.log(`  heap after         : ${mb(heapAfterEach.at(-1))} MB`);
console.log(`  total delta        : ${mb(heapAfterEach.at(-1) - before)} MB`);
console.log(`  per-file step      : ${steps.map((s) => `${mb(s)}`).join(", ")} MB`);
console.log(`  per-load time      : ${times.map((t) => `${t}ms`).join(", ")}`);

const steady = steps.slice(1); // drop the first, which may include a one-time cache
const meanStep = steady.reduce((a, b) => a + b, 0) / steady.length;
const perRecordBytes = meanStep / RECORDS_PER_FILE;
console.log(`\n  mean steady step   : ${mb(meanStep)} MB per file (~${RECORDS_PER_FILE} records)`);
console.log(`  => ~${(perRecordBytes / 1024).toFixed(1)} KB per record`);
console.log(`  => ~${mb(perRecordBytes * TARGET_RECORDS)} MB at the ${TARGET_RECORDS}-record cap`);

console.log("\nCaveats: heap is a whole-page figure (app, wasm, rendering included),");
console.log(`and records-per-file is assumed at ${RECORDS_PER_FILE} rather than measured.`);
