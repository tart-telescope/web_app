# e2e

Playwright stories against an already-running dev server, plus standalone
profilers. The stories assert behaviour; the numbers they print are the point of
most of them.

The stories load real files from the Edge Cache, so the dev server needs a
telescope behind it — the SSH tunnel described in the README, with Local Mode
on. Without it they fail on an empty table.

```bash
pnpm dev                                # in another terminal
pnpm test:e2e                           # all stories, ~1 min
pnpm test:e2e 03-hover --headed         # one story (filename substring)
pnpm test:e2e --headed -g "tapping"     # one test (title substring)
```

Headless Chromium has no GPU, so WebGL falls back to SwiftShader and rasterises
every frame on the CPU. Anything measured in frames needs `--headed` to mean
what a desk browser would do.

| Variable                                            | Used by     | For                                       |
| --------------------------------------------------- | ----------- | ----------------------------------------- |
| `E2E_BASE_URL`                                      | all         | point at another origin                   |
| `E2E_PATH`                                          | all stories | query string, e.g. `/?flags=color-worker` |
| `E2E_FILES`                                         | 02, 03, 04  | how many edge-cache files to load         |
| `E2E_ROW_INDEX`                                     | 00          | which row to load                         |
| `E2E_WINDOW_MS`, `E2E_WARMUP_MS`, `E2E_SWEEP_STEPS` | 03          | sample window and sweep granularity       |
| `HEADED=1`                                          | tools       | run a profiler in a real browser          |

Stories pin `?refresh=120` so the live poll cannot append a record mid-run.

## Stories — `user-stories/`

| #   | Measures                                                            |
| --- | ------------------------------------------------------------------- |
| 00  | Page load and first visibility — the one-time, cold-path costs.     |
| 01  | Clicking the Edge Cache eye — steady-state time to file loaded.     |
| 02  | Changing the baseline selection — chart cost varies with selection. |
| 03  | Frame rate while sweeping the cursor across the amplitude chart.    |
| 04  | MP4 export covers the same time range the chart is showing.         |
| 05  | Tapping a satellite or the sphere on a touch device.                |

## Support — `user-stories/support/`

| File             | Provides                                                     |
| ---------------- | ------------------------------------------------------------ |
| `edge-cache.mjs` | Shared Edge Cache driving, row loading, and load timing.     |
| `frames.mjs`     | In-page rAF sampler: frame rate, jank, main-thread blocking. |
| `zoom-range.mjs` | The chart's x range and the recorder's, read from app state. |

## Tools — `e2e/tools/`

Not tests. Run directly; they print a table and exit.

```bash
node e2e/tools/measure-history-cost.mjs 5
HEADED=1 node e2e/tools/profile-hover.mjs
```

| File                          | Reports                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `measure-history-cost.mjs`    | History memory per record layout, `vis-typed-arrays` on vs off. |
| `profile-load-visibility.mjs` | CPU profile of an Edge Cache load, with the busy-time split.    |
| `profile-baseline-slider.mjs` | CPU profile of a baseline selection change.                     |
| `profile-hover.mjs`           | Where a hover's ~69 ms goes, per function and component.        |
