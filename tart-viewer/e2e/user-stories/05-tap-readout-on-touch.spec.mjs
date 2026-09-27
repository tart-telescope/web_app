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

test("tapping the sphere places the readout under the finger", async ({ page }) => {
  await page.goto("/?view=simple");

  // The scene only appears once data has arrived.
  const container = page.locator(".threejs-3d-container.scene-visible");
  await expect(container).toBeVisible({ timeout: 60_000 });

  const box = await page.locator("canvas.threejs-canvas").boundingBox();
  expect(box, "no canvas to tap").not.toBeNull();

  const taps = [
    { fx: 0.5, fy: 0.45 },
    { fx: 0.35, fy: 0.6 },
    { fx: 0.7, fy: 0.35 },
  ];

  const lines = [];
  for (const { fx, fy } of taps) {
    const px = box.x + box.width * fx;
    const py = box.y + box.height * fy;
    await page.touchscreen.tap(px, py);
    await page.waitForTimeout(500);

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

    lines.push(`tap (${fx}, ${fy}) -> (${Math.round(readout.x)}, ${Math.round(readout.y)})  ${readout.text.replace(/\s+/g, " ")}`);
  }

  console.log("\n" + lines.join("\n") + "\n");

  test.info().annotations.push({ type: "measurement", description: `readout placed within 80px of the tap on ${taps.length} taps` });
});
