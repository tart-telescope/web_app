/**
 * Thin wrapper over the `tart-catalogue` wasm module.
 *
 * Knows nothing about HTTP or storage; it is handed TLE records and times.
 * The module is imported lazily so that a checkout without a built
 * `pkg-catalogue/` still boots the app — it simply never goes local.
 */

let modulePromise = null;
let wasm = null;
let failed = false;

/**
 * Load and initialise the wasm module, at most once.
 * Resolves to the module namespace, or null if unavailable.
 * @param {number} [timeoutMs] - bail out rather than hang the first query
 * @returns {Promise<Object|null>}
 */
/**
 * The memoised module load. Shared by ensureLocalReady and warmCatalogueWasm
 * so a warm-up in flight is never duplicated by a query arriving during it.
 * @returns {Promise<Object|null>}
 */
function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        const mod = await import("tart-catalogue");
        await mod.default();
        // Mirrors window.wasmReady for the gridless module, so diagnostics
        // can see that satellite positions are being computed locally.
        globalThis.catalogueWasmReady = true;
        return mod;
      } catch (error) {
        console.warn("[catalogue] local wasm unavailable, using remote API:", error);
        return null;
      }
    })();
  }

  return modulePromise;
}

export async function ensureLocalReady(timeoutMs = 2000) {
  if (wasm) return wasm;
  if (failed) return null;

  // Never let a slow module load stall a satellite query indefinitely; the
  // caller falls back to remote and the load continues in the background.
  const loaded = await Promise.race([loadModule(), new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))]);

  if (!loaded) return wasm;

  wasm = loaded;
  return wasm;
}

/**
 * Warm the module ahead of first use.
 *
 * Unlike ensureLocalReady this races no timeout: warming happens off the
 * critical path, so it waits as long as the module needs rather than giving up
 * and leaving the first satellite query to pay for it.
 *
 * @returns {Promise<boolean>} whether the module ended up usable
 */
export async function warmCatalogueWasm() {
  if (wasm) return true;

  const mod = await loadModule();
  if (mod) {
    wasm = mod;
  }

  return mod !== null;
}

/** Synchronous readiness check. */
export function isLocalReady() {
  return wasm !== null;
}

/** TLE records -> propagator handle, or null if the set is unusable. */
function buildPropagators(records) {
  if (!wasm || !Array.isArray(records) || records.length === 0) return null;
  try {
    return new wasm.CataloguePropagators(JSON.stringify(records));
  } catch (error) {
    console.warn("[catalogue] could not build propagators:", error);
    return null;
  }
}

/**
 * Horizontal positions for every TLE at one instant.
 * Rows are `{name, az, el, r, jy}` with `r` in metres, matching the server's
 * /catalog response.
 * @returns {Array|null} null when the local path cannot serve this request
 */
export function azElAt(records, unixSecs, lat, lon, alt = 0, minElDeg = 0) {
  const propagators = buildPropagators(records);
  if (!propagators) return null;

  try {
    const rows = propagators.horizontal_positions(unixSecs, lat, lon, alt, minElDeg);
    return Array.isArray(rows) && rows.length > 0 ? rows : null;
  } catch (error) {
    console.warn("[catalogue] propagation failed:", error);
    return null;
  } finally {
    propagators.free();
  }
}

/**
 * Horizontal positions for many instants in one call.
 * @returns {Array<Array>|null} one row array per input instant
 */
export function azElBulk(records, unixSecs, lat, lon, alt = 0, minElDeg = 0) {
  const propagators = buildPropagators(records);
  if (!propagators) return null;

  try {
    const rows = propagators.horizontal_positions_bulk(Float64Array.from(unixSecs), lat, lon, alt, minElDeg);
    return Array.isArray(rows) ? rows : null;
  } catch (error) {
    console.warn("[catalogue] bulk propagation failed:", error);
    return null;
  } finally {
    propagators.free();
  }
}

/** Module version string, or null when not loaded. */
export function version() {
  return wasm ? wasm.version() : null;
}
