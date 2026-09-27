import { devices, expect, test } from "@playwright/test";

/**
 * User story: on a touch device, tapping the sphere shows the az/el readout
 * where you tapped.
 *
 * It used to appear in the top-left corner. Nothing on the touch path had ever
 * positioned it: `onTouchStart` hid the readout and `onTouchEnd` showed it
 * again, but the only code that sets its left/top is `updateCoordinateSprite`,
 * which is reached from `onMouseMove` and from `onTouchMove` only while
 * `!isMouseDown` — which a touch never is, because `onTouchStart` sets it
 * before any move. An absolutely positioned element with no offsets falls back
 * to its static position, and for a div appended to the canvas container that
 * is the top-left corner.
 *
 * The desktop path was always fine, so this needs a real touch context to see
 * at all.
 */

test.use({ ...devices["Pixel 7"] });

/** The readout is a bare div appended to the container, not part of the template. */
const READOUT = `(() => {
  const container = document.querySelector(".threejs-3d-container");
  if (!container) return null;
  const div = [...container.querySelectorAll("div")].find(
    (d) => d.style.position === "absolute" && d.style.fontFamily.includes("monospace"),
  );
  if (!div) return null;
  const rect = div.getBoundingClientRect();
  return {
    display: div.style.display,
    left: div.style.left,
    top: div.style.top,
    text: div.textContent.trim(),
    x: rect.x,
    y: rect.y,
  };
})()`;

/** The satellite tooltip: name, elevation and azimuth. */
const TOOLTIP = `(() => {
  const tip = document.querySelector(".satellite-tooltip");
  return tip ? tip.textContent.replace(/\\s+/g, " ").trim() : null;
})()`;

/** Where the scene is ready to be interacted with. */
async function readyScene(page) {
  await page.goto("/?view=simple");
  await expect(page.locator(".threejs-3d-container.scene-visible")).toBeVisible({ timeout: 60_000 });
  const box = await page.locator("canvas.threejs-canvas").boundingBox();
  expect(box, "no canvas to tap").not.toBeNull();
  return box;
}

/**
 * Tap around the sphere until one lands on a satellite.
 *
 * The satellites are small and their positions come from the catalogue, so
 * there is no fixed point to aim at. Found quickly in practice — the scan is
 * bounded so a miss fails loudly rather than hanging.
 */
async function findSatellite(page, box, budgetMs = 40_000) {
  const started = Date.now();
  for (let attempt = 0; attempt < 400; attempt++) {
    // Budgeted, so a miss fails on the assertion below with a readable message
    // rather than running the scan out into a test timeout.
    if (Date.now() - started > budgetMs) break;
    const fx = 0.15 + (attempt % 18) * 0.04;
    const fy = 0.15 + Math.floor(attempt / 18) * 0.04;
    if (fx > 0.85 || fy > 0.85) break;
    const px = box.x + box.width * fx;
    const py = box.y + box.height * fy;
    await page.touchscreen.tap(px, py);
    await page.waitForTimeout(40);
    if (await page.evaluate(TOOLTIP)) return { px, py };
  }
  return null;
}

test("tapping a satellite shows its name and coordinates", async ({ page }) => {
  const box = await readyScene(page);

  const satellite = await findSatellite(page, box);
  expect(satellite, "no satellite could be found by tapping across the sphere").not.toBeNull();

  const shown = await page.evaluate(TOOLTIP);
  expect(shown, "tapping a satellite showed no tooltip").toMatch(/El: [\d.-]+°\s*Az: [\d.-]+°/);

  // The az/el readout stands aside while a satellite is marked, so the two
  // readouts are never on screen at once.
  const readout = await page.evaluate(READOUT);
  expect(readout?.display ?? "none", "the position readout and the satellite tooltip are both showing").not.toBe("block");

  // Tapping away from it clears the tooltip.
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.95);
  await page.waitForTimeout(400);
  expect(await page.evaluate(TOOLTIP), "the tooltip stayed after tapping empty sky").toBeNull();

  // Dragging from a satellite rotates the sphere; it must not mark one.
  await findSatellite(page, box);
  expect(await page.evaluate(TOOLTIP), "the satellite could not be re-found for the drag check").not.toBeNull();
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.95);
  await page.waitForTimeout(300);

  const cdp = await page.context().newCDPSession(page);
  const send = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await send("touchStart", [{ x: satellite.px, y: satellite.py }]);
  for (let step = 1; step <= 8; step++) await send("touchMove", [{ x: satellite.px + step * 10, y: satellite.py }]);
  await send("touchEnd", []);
  await page.waitForTimeout(500);

  expect(await page.evaluate(TOOLTIP), "dragging the sphere marked a satellite instead of rotating").toBeNull();

  console.log(`\nsatellite tapped at (${Math.round(satellite.px)}, ${Math.round(satellite.py)}) -> ${shown}\n`);
});

/**
 * Tap near a point until the tap lands on sky rather than a satellite.
 *
 * A satellite under the finger marks it and the readout stands aside, which is
 * correct but not what this test is about. Nudging by a few tens of pixels is
 * enough — the satellites are small.
 *
 * @returns the point actually tapped
 */
async function tapSky(page, x, y) {
  const offsets = [
    [0, 0],
    [18, 0],
    [-18, 0],
    [0, 18],
    [0, -18],
    [26, 16],
    [-26, -16],
  ];
  for (const [dx, dy] of offsets) {
    await page.touchscreen.tap(x + dx, y + dy);
    await page.waitForTimeout(220);
    if (!(await page.evaluate(TOOLTIP))) return { x: x + dx, y: y + dy };
  }
  return null;
}

test("tapping the sphere places the readout under the finger", async ({ page }) => {
  const box = await readyScene(page);

  const taps = [
    { fx: 0.5, fy: 0.45 },
    { fx: 0.35, fy: 0.6 },
    { fx: 0.7, fy: 0.35 },
  ];

  const lines = [];
  for (const { fx, fy } of taps) {
    const spot = await tapSky(page, box.x + box.width * fx, box.y + box.height * fy);
    expect(spot, `every tap near (${fx}, ${fy}) landed on a satellite`).not.toBeNull();
    const { x: px, y: py } = spot;

    const readout = await page.evaluate(READOUT);
    expect(readout, "the az/el readout was never created").not.toBeNull();
    expect(readout.display, "the readout is not showing after a tap").toBe("block");
    expect(readout.left, "the readout was shown without a position").not.toBe("");
    expect(readout.top, "the readout was shown without a position").not.toBe("");

    // The failure this guards was a hard 0,0, so a generous radius still
    // catches it while tolerating the readout's own offset and size.
    const distance = Math.hypot(readout.x - px, readout.y - py);
    expect(distance, `the readout appeared ${Math.round(distance)}px from the tap, at (${readout.x}, ${readout.y})`).toBeLessThan(80);
    expect(readout.text, "the readout is empty").toMatch(/Az: [\d.]+°\s*El: [\d.]+°/);

    lines.push(
      `tap (${Math.round(px)}, ${Math.round(py)}) -> (${Math.round(readout.x)}, ${Math.round(readout.y)})  ${readout.text.replace(/\s+/g, " ")}`,
    );
  }

  console.log("\n" + lines.join("\n") + "\n");

  test.info().annotations.push({ type: "measurement", description: `readout placed within 80px of the tap on ${taps.length} taps` });
});
