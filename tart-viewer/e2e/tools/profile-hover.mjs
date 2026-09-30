/**
 * Attribute the cost of moving the cursor across the amplitude/phase chart.
 *
 * Story 03 measures the frame rate; this says where the frames go. Every cursor
 * position over the plot is a real update — UPlotChart emits mouse-move from
 * its setCursor hook, Baseline turns that into setHoveredTimestamp on the
 * store, and the store's currentVisData getter is what Synthesis renders the
 * 3D scene from — so the question is which link in that chain is expensive, and
 * whether the cost is per cursor position or per frame.
 *
 * Two measurements:
 *
 *   1. Isolated hover. Park the cursor off the chart, then take one step onto
 *      it, and read the long-animation-frame entry that follows. Repeating this
 *      gives the cost of a single update with no queueing behind it.
 *
 *   2. A sweep under the CDP sampling profiler, attributed by function and by
 *      component, so the cheap answer points at the real hotspot.
 *
 * Usage:
 *   node e2e/tools/profile-hover.mjs [files]        # default 5
 *   HEADED=1 node e2e/tools/profile-hover.mjs
 *
 * Headless runs WebGL on SwiftShader; the split between JavaScript and
 * rasterisation is not trustworthy there. The JavaScript attribution is.
 */

import { chromium } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const FILES = Number(process.argv[2] ?? 5);
const TRIALS = Number(process.env.TRIALS ?? 12);
const SWEEP_MS = Number(process.env.SWEEP_MS ?? 3000);
const STEPS = 40;

const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args: ["--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await page.goto(BASE_URL);

const rows = page.locator(".v-data-table tbody tr").filter({ hasText: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/ });
await rows.first().waitFor({ state: "visible", timeout: 30_000 });
const rowCount = await rows.count();

async function loadRow(index) {
  const eye = rows.nth(index).getByRole("button").first();
  const done = page.waitForResponse((r) => /\/vis\/.*\.hdf(\?|$)/.test(r.url()) && r.status() === 200, { timeout: 60_000 });
  await eye.click();
  await done;
  await eye
    .locator(".v-progress-circular")
    .waitFor({ state: "hidden", timeout: 120_000 })
    .catch(() => {});
}

const loaded = Math.min(FILES, rowCount);
process.stdout.write(`loading ${loaded} files`);
for (let i = 0; i < loaded; i++) {
  await loadRow(i);
  process.stdout.write(".");
}
console.log(" done");

// The plot immediately above the Baseline slider, as in story 03.
const box = await page.evaluate(() => {
  const plots = [...document.querySelectorAll(".u-over")];
  const sliderTop = document.querySelector(".v-range-slider").getBoundingClientRect().top;
  const target = plots.reduce((a, b) =>
    sliderTop - b.getBoundingClientRect().bottom < sliderTop - a.getBoundingClientRect().bottom ? b : a,
  );
  const r = target.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});

const y = box.y + box.height / 2;
const left = box.x + box.width * 0.1;
const right = box.x + box.width * 0.9;
// A point inside the Edge Cache table: over the page, but not over any chart.
const parked = { x: box.x + box.width / 2, y: 300 };

/** Collect long-animation-frame entries into an array on the page. */
async function watchLongFrames(on) {
  await page.evaluate((enable) => {
    window.__loaf ??= [];
    if (!enable) {
      window.__loaf.length = 0;
      return;
    }
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__loaf.push({
          duration: entry.duration,
          blocking: entry.blockingDuration,
          scripts: (entry.scripts ?? []).map((s) => ({
            fn: s.sourceFunctionName,
            url: (s.sourceURL || "").split("/").pop(),
            duration: s.duration,
          })),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: false });
  }, on);
}

// Warm up: the first hover pays whatever is lazy.
await page.mouse.move(left, y);
await page.waitForTimeout(400);
await page.mouse.move(parked.x, parked.y);
await page.waitForTimeout(400);

// 1. One cursor position at a time.
await watchLongFrames(true);
const single = [];
for (let trial = 0; trial < TRIALS; trial++) {
  await page.mouse.move(parked.x, parked.y);
  await page.waitForTimeout(250);

  const before = await page.evaluate(() => window.__loaf.length);
  const started = Date.now();
  // A fresh entry into the plot is one update, and so is leaving it again.
  await page.mouse.move(trial % 2 === 0 ? left : right, y);
  await page.waitForTimeout(250);
  const after = await page.evaluate((from) => window.__loaf.slice(from), before);

  if (after.length > 0) {
    single.push({
      frames: after.length,
      duration: after.reduce((a, e) => a + e.duration, 0),
      blocking: after.reduce((a, e) => a + e.blocking, 0),
      scripts: after.flatMap((e) => e.scripts),
      wall: Date.now() - started,
    });
  }
}

// 2. A sweep under the sampler.
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
await cdp.send("Profiler.start");

const sweepStarted = Date.now();
let dispatched = 0;
while (Date.now() - sweepStarted < SWEEP_MS) {
  await page.mouse.move(right, y, { steps: STEPS });
  dispatched += STEPS;
  await page.mouse.move(left, y, { steps: STEPS });
  dispatched += STEPS;
}
const sweepWall = Date.now() - sweepStarted;

const { profile } = await cdp.send("Profiler.stop");
await browser.close();

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
let busyMicros = 0;
const byFunction = new Map();
const byPlace = new Map();

for (const [i, id] of profile.samples.entries()) {
  const node = byId.get(id);
  const dt = profile.timeDeltas[i] ?? 0;
  if (!node || node.callFrame.functionName === "(idle)") continue;
  busyMicros += dt;

  const { functionName, url } = node.callFrame;
  const key = `${functionName || "(anonymous)"}  ${(url || "").split("/").pop()}`;
  byFunction.set(key, (byFunction.get(key) ?? 0) + dt);

  let place = "other";
  for (const [needle, label] of [
    ["Baseline.vue", "Baseline.vue"],
    ["UPlotChart", "UPlotChart.vue"],
    ["Synthesis", "Synthesis.vue"],
    ["Threejs3D", "Threejs3D.vue"],
    ["uplot", "uplot"],
    ["wasm", "wasm"],
    ["vue.runtime", "vue runtime"],
  ]) {
    if ((url || "").includes(needle)) {
      place = label;
      break;
    }
  }
  if (functionName === "(program)" || !url) place = "VM internal / native";
  byPlace.set(place, (byPlace.get(place) ?? 0) + dt);
}

function median(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** One indented line per entry, largest first, with a share of the total. */
function table(map, limit, total) {
  return [...map.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => `  ${(v / 1000).toFixed(1).padStart(9)} ms  ${total > 0 ? ((v / total) * 100).toFixed(0).padStart(3) : "  0"}%  ${k}`)
    .join("\n");
}

const complete = single.filter((s) => s.frames > 0);
console.log(`\nOne cursor position at a time  (${complete.length}/${TRIALS} trials produced a long frame)`);
console.log(`  long frames per hover : ${median(complete.map((s) => s.frames)).toFixed(1)}`);
console.log(`  frame duration        : ${median(complete.map((s) => s.duration)).toFixed(1)} ms`);
console.log(`  blocking duration     : ${median(complete.map((s) => s.blocking)).toFixed(1)} ms`);
console.log(
  `  attributed to         : ${table(
    complete
      .flatMap((s) => s.scripts)
      .reduce(
        (m, s) => m.set(`${s.fn || "(anonymous)"}  ${s.url}`, (m.get(`${s.fn || "(anonymous)"}  ${s.url}`) ?? 0) + s.duration),
        new Map(),
      ),
    3,
    0,
  ).trim()}`,
);

console.log(`\nA ${sweepWall} ms sweep  (${dispatched} mouse moves dispatched)`);
console.log(`  busy on the main thread : ${(busyMicros / 1000).toFixed(0)} ms`);
console.log(`  per move dispatched     : ${(busyMicros / 1000 / dispatched).toFixed(1)} ms`);
console.log(`\nBy component:\n${table(byPlace, 8, busyMicros)}`);
console.log(`\nBy function (self time):\n${table(byFunction, 20, busyMicros)}`);
