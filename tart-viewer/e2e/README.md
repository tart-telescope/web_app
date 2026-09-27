# E2E user stories

Playwright tests that drive the running app the way a person does, and report
timings. The point is measurement as much as correctness: each story prints the
durations it cares about, so a change that makes something slower is visible.

## Running

The tests attach to an already-running dev server, so start that first:

```sh
pnpm dev          # http://localhost:3000
pnpm test:e2e
```

Useful flags:

```sh
pnpm test:e2e --repeat-each=3      # variance across runs
pnpm test:e2e --headed             # watch it happen
E2E_ROW_INDEX=5 pnpm test:e2e      # load a different Edge Cache row
E2E_BASE_URL=http://host/ pnpm test:e2e
```

## User stories

`user-stories/` holds one file per story, numbered in the order a user would
meet them. Each opens with the story itself ("a user does X and we measure Y"),
then states what counts as the action being _finished_ and why that signal is
trustworthy.

Naming: `NN-short-slug.spec.mjs`.

## What the tests depend on

They are not hermetic. They read the live edge cache through the dev server's
proxy, which reaches the telescope over the SSH tunnel on port 1234. The
visibility list and the file contents therefore have to be reachable, and the
absolute numbers move with network conditions.

They also run in headless Chromium, which has no GPU, so the WebGL synthesis
view falls back to SwiftShader. Treat the timings as an upper bound and compare
them against each other, not against a desk machine.

## Stories

A load costs very different amounts the first time and every time after, so the
two are separate stories. Folded together, the one-time setup would make the
steady-state figure look several times worse than it is, and a regression in
either path would hide behind the other.

### 00 — page load, then the first visibility

Everything that happens once per page load: bundle evaluation, wasm init, first
synthesis render, sphere geometry, shader compilation. The visibility load here
is the cold path.

Three runs on a dev box through the tunnel:

| Segment                     | Time        |
| --------------------------- | ----------- |
| nav → gridless wasm         | 380–587 ms  |
| nav → catalogue wasm        | 972–1382 ms |
| nav → app usable            | 880–1269 ms |
| first load click → fetched  | 108–134 ms  |
| first load click → finished | 1.8–2.4 s   |

### 01 — load a visibility from the edge cache

The steady-state figure. A warm-up load pays the costs story 00 owns, so what
remains is the per-load cost.

| Segment                 | Time        |
| ----------------------- | ----------- |
| click → file fetched    | 0.1–1.1 s   |
| click → action finished | 1.26–1.29 s |

Subtracting the fetch leaves roughly **150–440 ms of client work per load** —
the parse, the store update and the enrichment. So most of what looked like a
slow load is one-time setup, and the rest is dominated by the network: the fetch
alone swings from ~100 ms to ~1.1 s between runs.

"In the UI" here means the eye button's loading spinner clearing, which
`RecentData.vue` drives for the whole of `loadVisibilityFile()`.

## Profiling

`tools/profile-load-visibility.mjs` drives the same interaction with a CDP CPU
profile and a long-task observer running across the click, then prints a
self-time breakdown grouped by source. It instruments no application code.

```sh
node e2e/tools/profile-load-visibility.mjs            # cold: first load
WARM=1 node e2e/tools/profile-load-visibility.mjs     # steady state
HEADED=1 ...                                          # real display
```

It follows the same split as the stories: without `WARM` it profiles the cold
path (first load, including all the one-time setup), with `WARM=1` it pays those
costs with a warm-up load first and profiles the steady-state load.

Headless Chromium has no GPU, so WebGL falls back to SwiftShader and roughly
**doubles** the cold-path time. Always compare headed against headless before
trusting an absolute number. The raw profile lands in
`/tmp/load-profile.cpuprofile`.

### Cold path (first load)

Headed, click → finished ≈ 1.8–2.4 s:

| Bucket                             | Share |
| ---------------------------------- | ----- |
| VM internal / native (incl. WebGL) | 30%   |
| gridless wasm (synthesis)          | 15%   |
| three.js                           | 15%   |
| app code (geometry building)       | 12%   |
| vue / vuetify runtime              | 8%    |
| h5wasm (HDF5 parse)                | 7%    |
| catalogue wasm (satellites)        | 1.6%  |

Roughly **half the interaction is main-thread blocking** — one 680 ms task
starts about 200 ms after the click. The weight is one-time geometry work:
`createSphereFromCorners` (`Threejs3D.vue:810`), the gridless sphere/pixel wasm
(221 ms in a single function), Three.js buffer attributes, and
`lonLatToCartesian` (`Threejs3D.vue:121`).

### Steady state (`WARM=1`)

Headed, click → finished **≈ 217 ms** (fetch 65 ms):

| Bucket                      | Share |
| --------------------------- | ----- |
| VM internal / native        | 73%   |
| idle                        | 8%    |
| h5wasm (HDF5 parse)         | 6%    |
| three.js                    | 4%    |
| vue / vuetify runtime       | 4%    |
| app code                    | 3%    |
| catalogue wasm (satellites) | 1%    |

There is almost nothing left to optimise here: about 150 ms of client work, of
which the biggest named cost is the HDF5 parse at ~30 ms, and the rest is
scattered small fragments under `(program)`. Satellite enrichment is ~6 ms.

**So the cost that matters is the one-time setup, not the per-load work.** That
is why the two are separate stories. If either needs to get faster, the cold
path is where the seconds are.
