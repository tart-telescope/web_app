import { expect } from "@playwright/test";

/**
 * Shared driving of the Edge Cache panel, so the stories differ only in what
 * they measure rather than in how they drive the UI.
 */

/**
 * Rows in the Edge Cache "Visibilities" tab.
 *
 * Filtered on a timestamp because until the list arrives the table renders a
 * single "No data available" row, which has no eye button.
 */
/**
 * Navigate to the app. E2E_PATH lets a run pick up a query string — notably
 * `/?flags=vis-typed-arrays` — so the stories can be run against either record
 * layout without a rebuild.
 */
export async function gotoApp(page, options) {
  const target = new URL(process.env.E2E_PATH ?? "/", "http://localhost");

  // Push the live poll out of the way. Each tick fetches the current visibility
  // and appends a record to the history, so a story that loads five files and
  // then counts them can be a record ahead of itself by the time it looks —
  // which is exactly the kind of off-by-one that reads as a bug in whatever the
  // story is testing.
  if (!target.searchParams.has("refresh")) {
    target.searchParams.set("refresh", "120");
  }

  await page.goto(target.pathname + target.search, options);
}

export function edgeCacheRows(page) {
  return page.locator(".v-data-table tbody tr").filter({ hasText: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/ });
}

/** Wait for the list to load; resolves to the row count. */
export async function waitForEdgeCache(page, timeout = 30_000) {
  const rows = edgeCacheRows(page);
  await expect(rows.first()).toBeVisible({ timeout });
  return rows.count();
}

/**
 * Click the eye button on one row and time the resulting load.
 *
 * "Finished" is the button's own loading spinner clearing. RecentData.vue
 * holds `loadingFile` for the whole of loadVisibilityFile() and clears it in a
 * finally, so the spinner covers the fetch, the parse and the enrichment
 * callback. That makes it the UI's own definition of the action completing.
 *
 * @returns {Promise<{toFetch:number,toFinish:number,file:string,spinnerSeen:boolean}>}
 */
export async function measureRowLoad(page, rowIndex) {
  const rows = edgeCacheRows(page);
  const row = rows.nth(rowIndex);
  const eye = row.getByRole("button").first();
  await expect(eye).toBeEnabled();

  // Arm the network watch before clicking so the response cannot be missed.
  const fetchDone = page.waitForResponse((r) => /\/vis\/.*\.hdf(\?|$)/.test(r.url()) && r.status() === 200, { timeout: 60_000 });

  const spinner = eye.locator(".v-progress-circular");

  const clickedAt = Date.now();
  await eye.click();

  // Best effort: a warm load can be fast enough that the spinner never renders
  // a frame we can sample. Missing it is not a failure.
  let spinnerSeen = false;
  try {
    await spinner.waitFor({ state: "visible", timeout: 5000 });
    spinnerSeen = true;
  } catch {
    spinnerSeen = false;
  }

  const response = await fetchDone;
  const fetchDoneAt = Date.now();

  await spinner.waitFor({ state: "hidden", timeout: 120_000 });
  const finishedAt = Date.now();

  // The action must have actually happened, and the button be usable again.
  expect(response.status()).toBe(200);
  await expect(eye).toBeEnabled();

  return {
    toFetch: fetchDoneAt - clickedAt,
    toFinish: finishedAt - clickedAt,
    file: response.url().split("/").pop(),
    spinnerSeen,
  };
}
