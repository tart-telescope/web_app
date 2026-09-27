/**
 * Read the two things that have to agree for an export to cover what the user
 * selected: the x range the amplitude chart is showing, and the range the
 * recorder will filter by.
 *
 * Neither is reachable through the DOM — the chart keeps its range in a uPlot
 * scale and the recorder reads it back out of the Pinia store — so this walks
 * the app's real component tree rather than a mock. It is the live state, just
 * not an advertised interface; if the chart or store is renamed this is the
 * one place that needs updating.
 */

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{chart: {min:number,max:number}|null,
 *   zoom: {min:number,max:number}|null, exportFrames: number, totalRecords: number}>}
 */
export async function zoomState(page) {
  return page.evaluate(() => {
    const app = document.querySelector("#app").__vue_app__;
    const store = app.config.globalProperties.$pinia._s.get("app");

    const chartRef = document.querySelector(".uplot-chart")?.__vueParentComponent?.exposed?.chart;
    const chart = chartRef?.value ?? chartRef;
    const scale = chart?.scales?.x;

    // The recorder's own filter, so this reports what an export would cover
    // rather than a restatement of the range.
    const zoom = store.currentZoomRange;
    const records = store.vis_history ?? [];
    const exportFrames = zoom
      ? records.filter((item) => {
          const t = new Date(item.timestamp).getTime();
          return t >= zoom.min * 1000 && t <= zoom.max * 1000;
        }).length
      : records.length;

    return {
      chart: scale ? { min: scale.min, max: scale.max } : null,
      zoom: zoom ? { min: zoom.min, max: zoom.max } : null,
      exportFrames,
      totalRecords: records.length,
    };
  });
}

/** The chart and the recorder must never disagree about the visible range. */
export function rangesMatch(state, tolerance = 1) {
  if (!state.chart || !state.zoom) return false;
  return Math.abs(state.chart.min - state.zoom.min) <= tolerance && Math.abs(state.chart.max - state.zoom.max) <= tolerance;
}

/** Drag a selection across the amplitude chart's plot area. */
export async function dragZoom(page, fromFraction, toFraction) {
  const box = await page.evaluate(() => {
    const r = document.querySelectorAll(".u-over")[0].getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromFraction, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toFraction, y, { steps: 12 });
  await page.mouse.up();
}

/** Double-click the plot, which uPlot itself treats as "reset the range". */
export async function doubleClickReset(page) {
  const box = await page.evaluate(() => {
    const r = document.querySelectorAll(".u-over")[0].getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height / 2);
}
