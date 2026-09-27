import { expect, test } from "@playwright/test";

/**
 * User story: load a visibility file from the Edge Cache.
 *
 * A user opens the Edge Cache panel, picks a visibility, and clicks the eye
 * button to load it. We measure the wall-clock time from the click until the
 * action is finished.
 *
 * What "finished" means here, and why: `RecentData.vue` sets `loadingFile` to
 * the row's filename for the whole duration of `loadVisibilityFile()` and
 * clears it in a `finally`. Vuetify renders that as a spinner inside the
 * button, so the spinner clearing is the UI's own signal that the load, the
 * parse, and the enrichment callback have all completed. That is the number
 * this story reports.
 *
 * The fetch and the parse are also timed separately, so a regression can be
 * attributed to the network or to the client.
 */

const ROW_INDEX = Number(process.env.E2E_ROW_INDEX ?? 0);

test("load a visibility from the edge cache", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");

  // The Edge Cache card defaults to the Visibilities tab. Rows come from
  // GET /api/v1/vis/data, so this waits on a real round-trip.
  //
  // Filter on a timestamp so we match a real row: until the list arrives the
  // table renders a single "No data available" row, which has no eye button.
  const rows = page.locator(".v-data-table tbody tr").filter({ hasText: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/ });
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });

  const rowCount = await rows.count();
  expect(rowCount, "edge cache should list at least one visibility").toBeGreaterThan(0);
  expect(ROW_INDEX, `E2E_ROW_INDEX ${ROW_INDEX} is out of range (0..${rowCount - 1})`).toBeLessThan(rowCount);

  const row = rows.nth(ROW_INDEX);
  const timestamp = (await row.locator("td").first().textContent()).trim();
  const eye = row.getByRole("button").first();
  await expect(eye).toBeEnabled();

  // Arm the network watch before clicking so we cannot miss the response.
  const fetchDone = page.waitForResponse((r) => /\/vis\/.*\.hdf(\?|$)/.test(r.url()) && r.status() === 200, { timeout: 60_000 });

  const spinner = eye.locator(".v-progress-circular");

  const clickedAt = Date.now();
  await eye.click();

  // Best effort: the load can be fast enough that the spinner never renders a
  // frame we can observe. Missing it is not a failure, so record it as null.
  let spinnerSeenAt = null;
  try {
    await spinner.waitFor({ state: "visible", timeout: 5000 });
    spinnerSeenAt = Date.now();
  } catch {
    spinnerSeenAt = null;
  }

  const response = await fetchDone;
  const fetchDoneAt = Date.now();

  await spinner.waitFor({ state: "hidden", timeout: 120_000 });
  const finishedAt = Date.now();

  const toFetch = fetchDoneAt - clickedAt;
  const toFinish = finishedAt - clickedAt;

  // The action must have actually happened: a file came back and the button
  // is usable again.
  expect(response.status()).toBe(200);
  await expect(eye).toBeEnabled();

  const lines = [
    `edge cache rows          : ${rowCount}`,
    `row loaded               : #${ROW_INDEX}  ${timestamp}`,
    `file                     : ${response.url().split("/").pop()}`,
    `spinner observed         : ${spinnerSeenAt === null ? "no (finished too fast to sample)" : "yes"}`,
    `click -> file fetched    : ${toFetch} ms`,
    `click -> action finished : ${toFinish} ms`,
  ];
  console.log("\n" + lines.join("\n") + "\n");

  test.info().annotations.push({
    type: "measurement",
    description: `click to finish: ${toFinish} ms (fetch ${toFetch} ms)`,
  });

  // Surface page errors, but do not fail on unrelated noise the app already
  // logs (it is a chatty app; see the console.* counts in the codebase).
  if (consoleErrors.length > 0) {
    console.log(`console errors during run (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 5)) console.log("  " + e.slice(0, 160));
  }
});
