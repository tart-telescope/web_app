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
/**
 * Wait until the scene actually has satellites in it.
 *
 * The sphere appears on its first colour update, but the satellites come from
 * the catalogue afterwards, so interacting before they arrive is a race rather
 * than a failure. Polled on a timer, not the default every-animation-frame,
 * because the viewer renders continuously.
 */
async function waitForSatellites(page) {
  await page.waitForFunction(
    () => {
      const setup = document.querySelector(".threejs-3d-container")?.__vueParentComponent?.setupState;
      const satellites = setup?.satellites;
      const list = Array.isArray(satellites) ? satellites : satellites?.value;
      return Array.isArray(list) && list.length > 0;
    },
    null,
    { timeout: 60_000, polling: 250 },
  );
}

/**
 * Where each satellite is on screen, projected with the scene's own camera.
 *
 * Aiming is otherwise guesswork: the satellites are small and their positions
 * come from the catalogue. The alternative — tapping a grid and checking after
 * each one — costs hundreds of taps, and every tap is a raycast across every
 * satellite plus a repaint, in a browser that is software-rendering the whole
 * scene. That is real CPU for no extra confidence.
 *
 * Column-major matrices, matching three.js `elements`.
 */
function satelliteScreenPositions(page) {
  return page.evaluate(() => {
    const setup = document.querySelector(".threejs-3d-container")?.__vueParentComponent?.setupState;
    const satellites = Array.isArray(setup?.satellites) ? setup.satellites : setup?.satellites?.value;
    const camera = setup?.camera?.value ?? setup?.camera;
    const canvas = document.querySelector("canvas.threejs-canvas");
    if (!Array.isArray(satellites) || !camera || !canvas) return [];

    const rect = canvas.getBoundingClientRect();
    const apply = (m, v) => [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
      m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
    ];

    return satellites
      .map((satellite) => {
        const e = satellite.matrixWorld.elements;
        const clip = apply(camera.projectionMatrix.elements, apply(camera.matrixWorldInverse.elements, [e[12], e[13], e[14], 1]));
        if (clip[3] === 0) return null;
        const ndc = [clip[0] / clip[3], clip[1] / clip[3]];
        return {
          x: rect.left + ((ndc[0] + 1) * rect.width) / 2,
          y: rect.top + ((-ndc[1] + 1) * rect.height) / 2,
          onScreen: Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1,
        };
      })
      .filter(Boolean);
  });
}

/**
 * A point on the canvas as far as possible from every satellite, so a tap there
 * is guaranteed to miss. Derived from the projected positions rather than
 * guessed, because the constellations move.
 */
function emptySpot(positions, box) {
  let best = null;
  let bestGap = -1;
  for (let fx = 0.05; fx <= 0.95; fx += 0.05) {
    for (let fy = 0.05; fy <= 0.95; fy += 0.05) {
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      const gap = Math.min(...positions.map((p) => Math.hypot(p.x - x, p.y - y)));
      if (gap > bestGap) {
        bestGap = gap;
        best = { x, y };
      }
    }
  }
  return best;
}

test("tapping a satellite shows its name and coordinates", async ({ page }) => {
  const box = await readyScene(page);
  await waitForSatellites(page);

  const positions = await satelliteScreenPositions(page);
  const onScreen = positions.filter((p) => p.onScreen);
  expect(onScreen.length, `no satellite is on screen to tap (${positions.length} in the scene)`).toBeGreaterThan(0);

  const target = onScreen[0];
  await page.touchscreen.tap(target.x, target.y);
  await page.waitForTimeout(400);

  const shown = await page.evaluate(TOOLTIP);
  expect(shown, "tapping a satellite showed no tooltip").toMatch(/El: [\d.-]+°\s*Az: [\d.-]+°/);

  // The az/el readout stands aside while a satellite is marked, so the two
  // readouts are never on screen at once.
  const readout = await page.evaluate(READOUT);
  expect(readout?.display ?? "none", "the position readout and the satellite tooltip are both showing").not.toBe("block");

  // Tapping away from every satellite clears the tooltip.
  const away = emptySpot(onScreen, box);
  await page.touchscreen.tap(away.x, away.y);
  await page.waitForTimeout(400);
  expect(await page.evaluate(TOOLTIP), "the tooltip stayed after tapping empty sky").toBeNull();

  // Dragging from a satellite rotates the sphere; it must not mark one.
  await page.touchscreen.tap(target.x, target.y);
  await page.waitForTimeout(400);
  expect(await page.evaluate(TOOLTIP), "the satellite could not be re-marked for the drag check").not.toBeNull();
  await page.touchscreen.tap(away.x, away.y);
  await page.waitForTimeout(300);

  const cdp = await page.context().newCDPSession(page);
  const send = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await send("touchStart", [{ x: target.x, y: target.y }]);
  for (let step = 1; step <= 8; step++) await send("touchMove", [{ x: target.x + step * 10, y: target.y }]);
  await send("touchEnd", []);
  await page.waitForTimeout(500);

  expect(await page.evaluate(TOOLTIP), "dragging the sphere marked a satellite instead of rotating").toBeNull();

  console.log(`\nsatellite tapped at (${Math.round(target.x)}, ${Math.round(target.y)}) -> ${shown}\n`);
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
