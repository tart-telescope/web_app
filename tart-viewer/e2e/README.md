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

### 01 — load a visibility from the edge cache

Clicks the eye button on an Edge Cache visibility and times it from the click
until the button's loading spinner clears, which is the UI's own signal that the
fetch, the parse and the enrichment callback have all finished.

Roughly, on a dev box through the tunnel:

| Segment                 | Time        |
| ----------------------- | ----------- |
| click → file fetched    | ~150–220 ms |
| click → action finished | ~3.5 s      |

The fetch is about 5% of the total, so the cost is client-side: parsing and
rendering the file, and enriching it with satellite positions.

## Profiling

`tools/profile-load-visibility.mjs` drives the same interaction with a CDP CPU
profile and a long-task observer running across the click, then prints a
self-time breakdown grouped by source. It instruments no application code.

```sh
node e2e/tools/profile-load-visibility.mjs      # headless, SwiftShader
HEADED=1 node e2e/tools/profile-load-visibility.mjs   # real display
```

Headless Chromium has no GPU, so WebGL falls back to SwiftShader and roughly
**doubles** the measured time. Always compare headed against headless before
trusting an absolute number. The raw profile lands in
`/tmp/load-profile.cpuprofile`.

### What the profile says

Headed, one visibility (click → finished ≈ 1.3 s; headless ≈ 2.5 s):

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
starts about 200 ms after the click.

So the cost is rendering, not I/O. The network fetch is ~100 ms and the HDF5
parse ~110 ms; satellite enrichment is ~25 ms, i.e. negligible. The weight sits
in rebuilding the synthesis geometry on load: `createSphereFromCorners`
(`Threejs3D.vue:810`), the gridless sphere/pixel wasm (221 ms in one function
alone), Three.js buffer attributes, and `lonLatToCartesian`
(`Threejs3D.vue:121`).
