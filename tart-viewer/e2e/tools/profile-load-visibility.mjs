/**
 * Profile the Edge Cache load, to answer "what is actually taking the time".
 *
 * Drives the same interaction as user story 01, but with a CDP CPU profile and
 * a long-task observer running across the click, then prints a self-time
 * breakdown by function. No application code is instrumented: the profile
 * attributes time to whatever really ran.
 *
 * Usage:
 *   node e2e/tools/profile-load-visibility.mjs [rowIndex]
 *
 * Writes the raw profile to /tmp/load-profile.cpuprofile for deeper inspection
 * (chrome://inspect or any .cpuprofile viewer).
 */

import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

// WARM=1 pays the one-time costs (wasm init, first synthesis render, sphere
// geometry, shaders) with a warm-up load first, so the profile describes the
// steady-state load. That is the counterpart of the story split: 00 is cold,
// 01 is warm. Default profiles the cold path.
const WARM = process.env.WARM === "1";
const ROW_INDEX = Number(process.argv[2] ?? process.env.E2E_ROW_INDEX ?? (WARM ? 1 : 0));

if (WARM && ROW_INDEX === 0) {
  throw new Error("WARM=1 warms up on row 0, so pick a different row to profile");
}

// Headless Chromium has no GPU, so WebGL runs on SwiftShader (software). That
// inflates anything rendering-related, which is most of this interaction — so
// compare HEADED=1 against the default before trusting the absolute numbers.
const HEADED = process.env.HEADED === "1";
const browser = await chromium.launch({
  headless: !HEADED,
  args: ["--enable-unsafe-swiftshader"],
});
const context = await browser.newContext();
const page = await context.newPage();

const cdp = await context.newCDPSession(page);

// --- long tasks: main-thread blocking, which is what makes it feel slow ---
await page.addInitScript(() => {
  window.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__longTasks.push({ start: e.startTime, duration: e.duration });
    }
  }).observe({ entryTypes: ["longtask"] });
});

await page.goto(BASE_URL);

const rows = page.locator(".v-data-table tbody tr").filter({ hasText: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/ });
await rows.first().waitFor({ state: "visible", timeout: 30_000 });
const rowCount = await rows.count();

// Pay the one-time costs before profiling, so a WARM run measures steady state.
if (WARM) {
  const warmEye = rows.nth(0).getByRole("button").first();
  const warmDone = page.waitForResponse((r) => /\/vis\/.*\.hdf(\?|$)/.test(r.url()) && r.status() === 200, { timeout: 60_000 });
  await warmEye.click();
  await warmDone;
  await warmEye
    .locator(".v-progress-circular")
    .waitFor({ state: "hidden", timeout: 120_000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

const row = rows.nth(ROW_INDEX);
const timestamp = (await row.locator("td").first().textContent()).trim();
const eye = row.getByRole("button").first();
await eye.waitFor({ state: "visible" });
const spinner = eye.locator(".v-progress-circular");

const fetchDone = page.waitForResponse((r) => /\/vis\/.*\.hdf(\?|$)/.test(r.url()) && r.status() === 200, { timeout: 60_000 });

// --- start profiling ---
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 100 }); // 100us
await cdp.send("Profiler.start");

const clickedAt = Date.now();
// Page-relative clock, so long tasks recorded since load can be filtered to
// just the interaction.
const clickedAtPage = await page.evaluate(() => performance.now());
await eye.click();
await spinner.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
const fetchResponse = await fetchDone;
const fetchDoneAt = Date.now();
await spinner.waitFor({ state: "hidden", timeout: 120_000 });
const finishedAt = Date.now();

const { profile } = await cdp.send("Profiler.stop");
const longTasks = await page.evaluate(() => window.__longTasks).catch(() => []);
await browser.close();

// --- aggregate self time per function ---
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const selfMicros = new Map();

for (const [i, id] of profile.samples.entries()) {
  const dt = profile.timeDeltas[i] ?? 0;
  selfMicros.set(id, (selfMicros.get(id) ?? 0) + dt);
}

/** Coarse grouping, so the answer to "what is taking the time" is readable. */
function bucketOf(functionName, url) {
  if (!url) {
    if (functionName === "(idle)") return "idle (waiting)";
    if (functionName === "(garbage collector)") return "garbage collector";
    return "VM internal / native";
  }
  if (url.includes("gridlesslib_bg.wasm")) return "gridless wasm (synthesis)";
  // Matched on the crate stem, not the emitted filename: renaming the crate
  // changes the suffix and this would silently stop attributing anything.
  if (url.includes("tart_catalogue")) return "catalogue wasm (satellites)";
  if (url.includes("h5wasm")) return "h5wasm (HDF5 parse)";
  if (url.includes("three.js")) return "three.js";
  if (/\/(components|stores|services|composables|utils)\//.test(url)) return "app code";
  if (/vuetify|vue|runtime-dom|pinia/i.test(url)) return "vue / vuetify runtime";
  return "other";
}

const byFunction = new Map();
const byBucket = new Map();
let totalMicros = 0;

for (const [id, micros] of selfMicros) {
  const node = byId.get(id);
  if (!node) continue;
  totalMicros += micros;

  const { functionName, url, lineNumber } = node.callFrame;

  const key = `${functionName || "(anonymous)"}  @  ${shortUrl(url)}:${lineNumber + 1}`;
  const entry = byFunction.get(key) ?? { micros: 0, samples: 0 };
  entry.micros += micros;
  entry.samples += 1;
  byFunction.set(key, entry);

  const bucket = bucketOf(functionName, url);
  byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + micros);
}

function shortUrl(u) {
  if (!u) return "(native)";
  try {
    const parsed = new URL(u);
    const path = parsed.pathname;
    const i = path.indexOf("/node_modules/");
    if (i !== -1) return path.slice(i + 14).replace(/^\.pnpm\/[^/]+\/node_modules\//, "");
    if (parsed.origin !== new URL(BASE_URL).origin) return parsed.origin + path;
    return path.replace(/^\/(src|@fs)/, "").replace(/^.*\/tart-viewer\//, "");
  } catch {
    return u.slice(0, 60);
  }
}

const ranked = [...byFunction.entries()].toSorted((a, b) => b[1].micros - a[1].micros);
const ms = (us) => (us / 1000).toFixed(1);

console.log(`\nEdge Cache load profile  [${WARM ? "steady state" : "cold, first load"}]  (row #${ROW_INDEX}, ${timestamp})`);
console.log(`  rows=${rowCount}  file=${fetchResponse.url().split("/").pop()}`);
console.log(`  click -> fetched : ${fetchDoneAt - clickedAt} ms`);
console.log(`  click -> finished: ${finishedAt - clickedAt} ms`);
console.log(`  profiled CPU     : ${ms(totalMicros)} ms\n`);

console.log("Where the CPU time goes");
console.log("  %cpu        ms  bucket");
for (const [bucket, micros] of [...byBucket.entries()].toSorted((a, b) => b[1] - a[1])) {
  const pct = ((micros / totalMicros) * 100).toFixed(1).padStart(5);
  console.log(`  ${pct}%  ${ms(micros).padStart(8)}  ${bucket}`);
}

console.log("\nTop self-time consumers");
console.log("  %cpu        ms   samples  function");
for (const [key, { micros, samples }] of ranked.slice(0, 18)) {
  const pct = ((micros / totalMicros) * 100).toFixed(1).padStart(5);
  console.log(`  ${pct}%  ${ms(micros).padStart(8)}  ${String(samples).padStart(7)}  ${key}`);
}

// Only blocking that happened after the click: entries accumulate from load.
const during = longTasks.filter((t) => t.start >= clickedAtPage);
console.log(`\nLong tasks during the interaction (click at ${clickedAtPage.toFixed(0)} ms)`);
if (during.length === 0) {
  console.log("  none recorded");
} else {
  for (const t of during) {
    const rel = t.start - clickedAtPage;
    console.log(`  ${t.duration.toFixed(0).padStart(5)} ms  at +${rel.toFixed(0)} ms`);
  }
  const total = during.reduce((a, t) => a + t.duration, 0);
  const pct = ((total / (finishedAt - clickedAt)) * 100).toFixed(0);
  console.log(`  total blocking: ${total.toFixed(0)} ms across ${during.length} tasks (${pct}% of the interaction)`);
}

writeFileSync("/tmp/load-profile.cpuprofile", JSON.stringify(profile));
console.log("\nraw profile -> /tmp/load-profile.cpuprofile");
