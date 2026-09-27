/**
 * Measure what the amplitude/phase chart costs, and whether it depends on which
 * baseline is selected.
 *
 * Baseline.vue's `filteredData` computed scans each history record's baseline
 * array with `.find(x => x.i === i && x.j === j)`. That scan stops at the first
 * match, so its cost depends on where the selected pair sits in the array — and
 * because it reads through the reactive proxy, it also forces a proxy for every
 * entry it touches.
 *
 * The thumbs are role="slider" with tabindex=0, so they take arrow keys. We
 * oscillate a thumb between two adjacent values, which keeps the selected
 * baseline roughly fixed while generating one recompute per keypress, and
 * attribute the CPU to Baseline.vue.
 *
 * Usage:
 *   node e2e/tools/profile-baseline-slider.mjs [files]      # default 20
 */

import { chromium } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const FILES = Number(process.argv[2] ?? 20);
const PRESSES = 5; // pairs of left/right presses per measurement

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext();
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await page.goto(BASE_URL);

const rows = page.locator(".v-data-table tbody tr").filter({ hasText: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/ });
await rows.first().waitFor({ state: "visible", timeout: 30_000 });
const rowCount = await rows.count();

/** Which part of the app a profile sample belongs to. */
function placeOf(functionName, url = "") {
  const source = url;
  for (const [needle, label] of [
    ["Baseline.vue", "Baseline.vue"],
    ["UPlotChart", "UPlotChart.vue"],
    ["Synthesis", "Synthesis.vue"],
    ["Threejs3D", "Threejs3D.vue"],
    ["ArrayLayout", "ArrayLayout.vue"],
    ["wasm", "wasm"],
  ]) {
    if (source.includes(needle)) return label;
  }
  if (functionName === "(program)" || source === "") return "VM internal / native";
  return "other";
}

/** Load one row and wait for the button's spinner to clear. */
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

const thumbs = page.locator(".v-range-slider .v-slider-thumb");
const lowThumb = thumbs.nth(0);
const highThumb = thumbs.nth(1);

/** The range slider mirrors its value into hidden text inputs. */
async function selected() {
  return page.evaluate(() => [...document.querySelectorAll(".v-range-slider input")].map((i) => Number(i.value)));
}

async function measure(label) {
  const position = await selected();

  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });

  const started = Date.now();
  await cdp.send("Profiler.start");

  // Every press must actually move the value, otherwise filteredData never
  // recomputes and the profile silently measures nothing. Presses are dropped
  // when the thumb is not focused, so count the ones that landed.
  let landed = 0;
  let previous = (await selected())[1];
  for (let k = 0; k < PRESSES; k++) {
    for (const key of ["ArrowLeft", "ArrowRight"]) {
      await highThumb.press(key);
      const now = (await selected())[1];
      if (now !== previous) landed += 1;
      previous = now;
    }
  }

  const { profile } = await cdp.send("Profiler.stop");
  const wall = Date.now() - started;

  // Self time attributed to the component, and to the page overall excluding
  // idle — the window itself includes Playwright's keystroke latency, so the
  // raw sum would just measure how fast we can press keys.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  let baselineMicros = 0;
  let busyMicros = 0;
  for (const [i, id] of profile.samples.entries()) {
    const dt = profile.timeDeltas[i] ?? 0;
    const node = byId.get(id);
    if (node?.callFrame.functionName === "(idle)") continue;
    busyMicros += dt;
    if (node?.callFrame.url?.includes("Baseline.vue")) baselineMicros += dt;
  }

  // Who else is spending the time, since the chart turns out to be a small part.
  const byPlace = new Map();
  for (const [i, id] of profile.samples.entries()) {
    const node = byId.get(id);
    if (!node || node.callFrame.functionName === "(idle)") continue;
    const { functionName, url } = node.callFrame;
    const where = placeOf(functionName, url);
    byPlace.set(where, (byPlace.get(where) ?? 0) + (profile.timeDeltas[i] ?? 0));
  }

  const recomputes = PRESSES * 2;
  return {
    label,
    position,
    wall,
    recomputes,
    landed,
    baselineMs: baselineMicros / 1000,
    perRecomputeMs: baselineMicros / 1000 / landed,
    busyMs: busyMicros / 1000,
    perRecomputeBusyMs: busyMicros / 1000 / recomputes,
    places: [...byPlace.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, 6),
  };
}

const atDefault = await measure("default [0,23]");

// Move to [4,10]: high thumb 23 -> 10, low thumb 0 -> 4.
for (let i = 0; i < 13; i++) await highThumb.press("ArrowLeft");
for (let i = 0; i < 4; i++) await lowThumb.press("ArrowRight");
await page.waitForTimeout(300);

const atMidRange = await measure("moved [4,10]");

await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nBaseline chart cost  (${loaded} files loaded)`);
console.log(`  ${pad("position", 12)} ${pad("Baseline.vue", 14)} ${pad("per recompute", 15)} ${pad("presses landed", 16)} busy total`);
for (const m of [atDefault, atMidRange]) {
  console.log(
    `  ${pad(JSON.stringify(m.position), 12)} ${pad(`${m.baselineMs.toFixed(1)} ms`, 14)} ` +
      `${pad(`${m.perRecomputeMs.toFixed(2)} ms`, 15)} ${pad(`${m.landed}/${m.recomputes}`, 16)} ${m.busyMs.toFixed(0)} ms`,
  );
}

const ratio = atMidRange.perRecomputeMs / atDefault.perRecomputeMs;
console.log(`\n  [4,10] costs ${ratio.toFixed(2)}x [0,23] per recompute`);

console.log(`\n  Where the rest of the busy time goes at [4,10]:`);
for (const [where, micros] of atMidRange.places) {
  const share = ((micros / (atMidRange.busyMs * 1000)) * 100).toFixed(1);
  console.log(`    ${(micros / 1000).toFixed(1).padStart(8)} ms  ${share.padStart(5)}%  ${where}`);
}

// Where each pair sits in a lexicographic (i<j) baseline ordering, which is
// what decides how far `.find()` has to scan.
function scanLength(i, j, n = 24) {
  let index = 0;
  for (let k = 0; k < i; k++) index += n - 1 - k;
  return index + (j - i - 1) + 1;
}
console.log(
  `  predicted scan length: [0,23] -> ${scanLength(0, 23)} entries, ` +
    `[4,10] -> ${scanLength(4, 10)} entries (ratio ${(scanLength(4, 10) / scanLength(0, 23)).toFixed(2)}x)`,
);
console.log("\n  Each keypress forces one recompute of filteredData over the whole history.");
