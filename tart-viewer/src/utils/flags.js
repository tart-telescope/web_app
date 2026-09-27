/**
 * Shared feature flags.
 *
 * Defaults come from the build (`VITE_*`, the convention already used by
 * VITE_CATALOG_URL and VITE_DISABLE_LOCAL_SATELLITES). A run can override them
 * with `?flags=name,-other` so a flag can be flipped for an A/B without a
 * rebuild — which is how the record-layout change gets measured against the
 * old shape.
 *
 * Deliberately NOT persisted to localStorage: a remembered override would
 * silently poison the next "flag off" measurement, and the whole point of the
 * flag here is comparing the two.
 */

const DEFAULTS = {
  /**
   * Store visibility records as a packed Float32Array plus a shared baseline
   * table, instead of an array of {i,j,re,im} objects. Measured at ~132 MB for
   * a full history; the packed form should be roughly an order of magnitude
   * smaller. See utils/visLayout.js.
   */
  "vis-typed-arrays": import.meta.env.VITE_VIS_TYPED_ARRAYS === "true",

  /**
   * Render the sphere's colour map in a worker instead of on the main thread.
   * `get_color_bytes_only` costs ~69 ms at nside 64 per cursor position, which
   * is a dropped frame for the whole page on every hover. See
   * services/colorRenderClient.js.
   */
  "color-worker": import.meta.env.VITE_COLOR_WORKER === "true",
};

const QUERY_PARAM = "flags";

let overrides = null;

function readOverrides() {
  if (overrides) return overrides;

  overrides = new Map();
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get(QUERY_PARAM);
    if (!raw) return overrides;

    for (const token of raw.split(",")) {
      const entry = token.trim();
      if (!entry) continue;
      // A leading dash disables, matching the concise form used by other tools.
      overrides.set(entry.startsWith("-") ? entry.slice(1) : entry, !entry.startsWith("-"));
    }
  } catch {
    // No location (a worker, SSR, a test without a document): keep the defaults.
  }

  return overrides;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isEnabled(name) {
  const override = readOverrides();
  if (override.has(name)) return override.get(name);
  return DEFAULTS[name] ?? false;
}

/** Every flag and its effective value, for diagnostics. */
export function allFlags() {
  const names = new Set([...Object.keys(DEFAULTS), ...readOverrides().keys()]);
  return Object.fromEntries([...names].map((name) => [name, isEnabled(name)]));
}
