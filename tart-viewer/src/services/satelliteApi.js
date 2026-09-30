import axios from "axios";

import { azElAt, azElBulk, ensureLocalReady, isLocalReady } from "@/services/satellite/localPropagation";
import { dayKeyFromUnix, getExact, getNearest, getNearestOffline, hourKeyFromUnix, put as putTles } from "@/services/satellite/tleCache";

/**
 * Normalise the many timestamp shapes callers pass in.
 * `vis_history` entries carry Date objects; the live telescope API returns
 * ISO strings.
 * @param {Date|string|number} value
 * @returns {number|null} unix seconds
 */
function toUnixSeconds(value) {
  if (value instanceof Date) return value.getTime() / 1000;
  if (typeof value === "number") return value > 1e11 ? value / 1000 : value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms / 1000;
  }
  return null;
}

/** RFC3339 to the hour, the form the /ephemerides endpoint expects. */
function toHourIso(unixSecs) {
  return `${hourKeyFromUnix(unixSecs)}:00:00Z`;
}

class SatelliteApiService {
  constructor() {}

  /**
   * Set the satellite catalog base URL
   * @param {string} url - The satellite catalog base URL
   */
  setUrl(url) {
    if (this.baseURL !== url) {
      this._cancelPendingRequests();
      this.baseURL = url;
      this._recreateClient();
    }
  }

  /**
   * Reset the service completely
   */
  reset() {
    this._cancelPendingRequests();
    this.client = null;
    this.baseURL = null;
  }

  /**
   * Get the current client, creating it if necessary
   * @returns {Object} Configured axios instance
   */
  _getClient() {
    if (!this.client && this.baseURL) {
      this._recreateClient();
    }
    if (!this.client) {
      throw new Error("Satellite API service not configured. Call setUrl() first.");
    }
    return this.client;
  }

  /**
   * Recreate the axios client with current configuration
   * @private
   */
  _recreateClient() {
    if (!this.baseURL) {
      this.client = null;
      return;
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.defaultTimeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Create new abort controller for this client
    this._createAbortController();
  }

  /**
   * Create a new AbortController for request cancellation
   * @private
   */
  _createAbortController() {
    this.abortController = new AbortController();
  }

  /**
   * Cancel all pending requests
   * @private
   */
  _cancelPendingRequests() {
    if (this.abortController) {
      this.abortController.abort();
      this._createAbortController();
    }
  }

  /**
   * Get request config with abort signal
   * @private
   */
  _getRequestConfig() {
    return {
      signal: this.abortController?.signal,
    };
  }

  /**
   * Handle async operations with centralized error handling
   * @private
   */
  async _handleRequest(operation, context = "Satellite API request") {
    try {
      return await operation();
    } catch (error) {
      if (error.name === "AbortError") {
        console.log(`${context} was cancelled`);
        return null;
      }
      console.error(`${context} failed:`, error);
      return null;
    }
  }

  /**
   * Whether local wasm computation is being used.
   * @returns {boolean}
   */
  isLocalReady() {
    return isLocalReady();
  }

  /**
   * Enable or disable the local computation path (kill switch).
   * @param {boolean} enabled
   */
  setLocalEnabled(enabled) {
    this.localEnabled = Boolean(enabled);
  }

  /**
   * Get satellite catalog data for a specific date and location
   *
   * Tries local wasm computation from cached TLEs first, falling back to the
   * remote /catalog endpoint so behaviour is unchanged when wasm is
   * unavailable or the TLEs cannot be fetched.
   *
   * @param {string} date - Date/timestamp for the catalog query
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} alt - Altitude (optional, defaults to 0)
   * @returns {Promise} Promise that resolves to satellite catalog data
   */
  async getCatalog(date, lat, lon, alt = 0) {
    if (this.localEnabled) {
      const local = await this._localCatalog(date, lat, lon, alt);
      if (local) return local;
    }
    return await this._remoteCatalog(date, lat, lon, alt);
  }

  /**
   * Get bulk satellite data for multiple timestamps
   *
   * Local-first, as getCatalog: computes every requested instant in a single
   * wasm call when possible.
   *
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} alt - Altitude (optional, defaults to 0)
   * @param {Array} dates - Array of timestamps/dates
   * @returns {Promise} Promise that resolves to bulk satellite data
   */
  async getBulkAzEl(lat, lon, alt = 0, dates) {
    if (this.localEnabled) {
      const local = await this._localBulkAzEl(lat, lon, alt, dates);
      if (local) return local;
    }
    return await this._remoteBulkAzEl(lat, lon, alt, dates);
  }

  /**
   * Remote single-instant catalog lookup (the original implementation).
   * @private
   */
  async _remoteCatalog(date, lat, lon, alt = 0) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get("/catalog", {
        params: { date, lat, lon, alt },
        ...this._getRequestConfig(),
      });
      return response.data;
    }, "Get satellite catalog");
  }

  /**
   * Remote bulk lookup (the original implementation).
   * @private
   */
  async _remoteBulkAzEl(lat, lon, alt = 0, dates) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.post(
        "/bulk_az_el",
        {
          lat,
          lon,
          alt,
          dates,
        },
        this._getRequestConfig(),
      );
      return response.data;
    }, "Get bulk satellite data");
  }

  /**
   * Local single-instant computation.
   * @private
   * @returns {Promise<Array|null>} null whenever the caller should fall back
   */
  async _localCatalog(date, lat, lon, alt = 0) {
    const unixSecs = toUnixSeconds(date);
    if (unixSecs === null) return null;

    if (!(await ensureLocalReady())) return null;

    const snapshot = await this._tleRecordsFor(unixSecs);
    if (!snapshot) return null;

    // minEl 0.0 matches the server's default; callers apply their own cuts.
    return azElAt(snapshot.records, unixSecs, lat, lon, alt ?? 0, 0);
  }

  /**
   * Local bulk computation.
   *
   * Groups instants by UTC day because the server resolves a TLE file per
   * requested date, so a window spanning midnight must not reuse one set.
   * @private
   */
  async _localBulkAzEl(lat, lon, alt = 0, dates) {
    const unixSecs = dates.map((d) => toUnixSeconds(d));
    if (unixSecs.some((t) => t === null)) return null;

    if (!(await ensureLocalReady())) return null;

    const groups = new Map();
    for (const [index, t] of unixSecs.entries()) {
      const key = dayKeyFromUnix(t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(index);
    }

    const out = Array.from({ length: dates.length });

    for (const indices of groups.values()) {
      const snapshot = await this._tleRecordsFor(unixSecs[indices[0]]);
      if (!snapshot) return null;

      const rows = azElBulk(
        snapshot.records,
        indices.map((i) => unixSecs[i]),
        lat,
        lon,
        alt ?? 0,
        0,
      );
      if (!rows || rows.length !== indices.length) return null;

      for (const [k, originalIndex] of indices.entries()) {
        out[originalIndex] = rows[k];
      }
    }

    // Echo the caller's own Date objects so the store's exact-millisecond
    // timestamp matching succeeds without relying on its 500 ms tolerance.
    return { dates, az_el: out };
  }

  /**
   * Resolve TLE records for an instant, cache-first.
   *
   * Order: exact hour hit, nearest snapshot within 12 h, network, then a
   * widened offline window so enrichment still works without connectivity.
   *
   * @private
   * @returns {Promise<{records: Array, hourKey: string, dayKey: string}|null>}
   */
  async _tleRecordsFor(unixSecs) {
    const hourKey = hourKeyFromUnix(unixSecs);
    const dayKey = dayKeyFromUnix(unixSecs);

    const exact = await getExact(hourKey);
    if (exact) return { records: exact.records, hourKey, dayKey: exact.dayKey };

    const nearest = await getNearest(unixSecs);
    if (nearest) return { records: nearest.records, hourKey, dayKey: nearest.dayKey };

    const fetched = await this._fetchEphemerides(unixSecs);
    if (fetched) {
      await putTles(hourKey, dayKey, fetched);
      return { records: fetched, hourKey, dayKey };
    }

    const offline = await getNearestOffline(unixSecs);
    if (offline) {
      console.warn("[catalogue] network unavailable, using a stale TLE snapshot");
      return { records: offline.records, hourKey, dayKey: offline.dayKey };
    }

    return null;
  }

  /**
   * Fetch raw TLEs from /ephemerides. Returns null on any failure.
   * @private
   */
  async _fetchEphemerides(unixSecs) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get("/ephemerides", {
        params: { date: toHourIso(unixSecs) },
        ...this._getRequestConfig(),
      });

      const records = response.data;
      if (!Array.isArray(records) || records.length === 0) return null;
      if (!records.every((r) => r && r.name && r.line1 && r.line2)) return null;

      return records;
    }, "Get ephemerides");
  }

  client = null;
  baseURL = null;
  defaultTimeout = 10_000;
  abortController = null;
  // Local wasm computation is on by default; VITE_DISABLE_LOCAL_SATELLITES
  // forces the remote path, which is useful for A/B comparison.
  localEnabled = import.meta.env.VITE_DISABLE_LOCAL_SATELLITES !== "true";
}

// Export a singleton instance
export default new SatelliteApiService();
