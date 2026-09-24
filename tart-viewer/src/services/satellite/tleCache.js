/**
 * IndexedDB cache for catalogue TLE snapshots.
 *
 * The catalogue's /ephemerides endpoint is keyed by a timestamp truncated to
 * the hour and sends no cache headers at all, so caching is entirely up to the
 * client. A snapshot is small (~28 KB for 139 satellites), so this keeps a
 * generous LRU and tolerates being offline.
 *
 * Every export treats any storage failure (private browsing, blocked
 * third-party storage, quota) as a cache miss rather than an error: the
 * caller then falls back to fetching, and ultimately to the remote API.
 */

const DB_NAME = "tart-viewer-catalogue";
const DB_VERSION = 1;
const STORE = "tle_snapshots";

/** Mirrors the upstream client's disk-cache limits (MAX_ENTRIES). */
const MAX_ENTRIES = 100;
/** Nearest acceptable snapshot: the upstream client's MAX_DELTA_HOURS. */
const MAX_DELTA_HOURS = 12;
/** Widened window used only when a fetch fails, so offline still works. */
const OFFLINE_DELTA_HOURS = 48;
/** Hard hygiene cutoff: never resurrect a snapshot older than this. */
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

let dbPromise = null;
let unavailable = false;

/**
 * Open (and memoise) the database. Resolves to null when IndexedDB is not
 * usable, which callers treat as "always a miss".
 * @returns {Promise<IDBDatabase|null>}
 */
export function openTleCache() {
  if (unavailable) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        unavailable = true;
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "hourKey" });
          store.createIndex("by_dayKey", "dayKey");
          store.createIndex("by_lastUsedAt", "lastUsedAt");
        }
      });

      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => {
        unavailable = true;
        resolve(null);
      });
      request.addEventListener("blocked", () => {
        unavailable = true;
        resolve(null);
      });
    } catch {
      unavailable = true;
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * UTC hour key, e.g. "2026-09-24T13". Matches the format the endpoint's date
 * parameter is truncated to.
 * @param {number} unixSecs
 * @returns {string}
 */
export function hourKeyFromUnix(unixSecs) {
  return new Date(Math.floor(unixSecs / 3600) * 3600 * 1000).toISOString().slice(0, 13);
}

/**
 * UTC day key, e.g. "2026-09-24". The server resolves a TLE file per day, so
 * this is also the natural grouping key for bulk requests.
 * @param {number} unixSecs
 * @returns {string}
 */
export function dayKeyFromUnix(unixSecs) {
  return new Date(Math.floor(unixSecs / 86_400) * 86_400 * 1000).toISOString().slice(0, 10);
}

/** True when a record is too old to trust regardless of proximity. */
function isStale(record) {
  return !record || Date.now() - record.fetchedAt > MAX_AGE_MS;
}

function run(db, mode, fn) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = fn(store);
      tx.addEventListener("complete", () => resolve(request?.result ?? null));
      tx.addEventListener("error", () => resolve(null));
      tx.addEventListener("abort", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/** Exact hour hit. Touches lastUsedAt so the LRU sees the read. */
export async function getExact(hourKey) {
  const db = await openTleCache();
  if (!db) return null;

  const record = await run(db, "readonly", (store) => store.get(hourKey));
  if (!record || isStale(record)) return null;

  touch(db, record);
  return record;
}

/** Fire-and-forget lastUsedAt bump; failures are ignored. */
function touch(db, record) {
  try {
    record.lastUsedAt = Date.now();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
  } catch {
    /* an LRU hint is never worth surfacing an error for */
  }
}

/**
 * Nearest snapshot to `unixSecs` within `maxDeltaHours`, mirroring the
 * upstream client's "nearest cached file" rule.
 * @param {number} unixSecs
 * @param {number} [maxDeltaHours]
 * @returns {Promise<Object|null>}
 */
export async function getNearest(unixSecs, maxDeltaHours = MAX_DELTA_HOURS) {
  const db = await openTleCache();
  if (!db) return null;

  const all = await run(db, "readonly", (store) => store.getAll());
  if (!all || all.length === 0) return null;

  let best = null;
  let bestDelta = Infinity;

  for (const record of all) {
    if (isStale(record)) continue;
    const deltaH = Math.abs(hourKeyToUnix(record.hourKey) - unixSecs) / 3600;
    if (deltaH < bestDelta) {
      bestDelta = deltaH;
      best = record;
    }
  }

  if (!best || bestDelta > maxDeltaHours) return null;

  touch(db, best);
  return best;
}

/**
 * Nearest snapshot, widened for the offline path.
 * @param {number} unixSecs
 * @returns {Promise<Object|null>}
 */
export function getNearestOffline(unixSecs) {
  return getNearest(unixSecs, OFFLINE_DELTA_HOURS);
}

function hourKeyToUnix(hourKey) {
  return Date.parse(`${hourKey}:00:00Z`) / 1000;
}

/**
 * Store a snapshot, then trim to the LRU cap.
 * @param {string} hourKey
 * @param {string} dayKey
 * @param {Array} records
 * @returns {Promise<boolean>}
 */
export async function put(hourKey, dayKey, records) {
  const db = await openTleCache();
  if (!db) return false;

  const now = Date.now();
  const record = {
    hourKey,
    dayKey,
    fetchedAt: now,
    lastUsedAt: now,
    count: records.length,
    records,
  };

  const ok = await run(db, "readwrite", (store) => store.put(record));
  await evictLru();
  return ok !== null;
}

/** Drop the least recently used snapshots beyond the cap. */
export async function evictLru(maxEntries = MAX_ENTRIES) {
  const db = await openTleCache();
  if (!db) return;

  const all = await run(db, "readonly", (store) => store.getAll());
  if (!all || all.length <= maxEntries) return;

  const doomed = all.toSorted((a, b) => (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0)).slice(0, all.length - maxEntries);

  await run(db, "readwrite", (store) => {
    for (const record of doomed) store.delete(record.hourKey);
  });
}

/** Remove everything. Used by the diagnostics/clear-cache affordance. */
export async function clear() {
  const db = await openTleCache();
  if (!db) return;
  await run(db, "readwrite", (store) => store.clear());
}

/** Cache summary, for diagnostics. */
export async function stats() {
  const db = await openTleCache();
  if (!db) return { available: false, count: 0 };

  const all = await run(db, "readonly", (store) => store.getAll());
  return {
    available: true,
    count: all?.length ?? 0,
    hours: (all ?? []).map((r) => r.hourKey).toSorted(),
  };
}

export const CACHE_LIMITS = {
  MAX_ENTRIES,
  MAX_DELTA_HOURS,
  OFFLINE_DELTA_HOURS,
  MAX_AGE_MS,
};
