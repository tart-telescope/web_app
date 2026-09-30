/**
 * The single place that knows how a visibility record stores its baselines.
 *
 * A record is either:
 *
 *   legacy:  { data: [{ i, j, re, im }, ...] }        one object per baseline
 *   packed:  { values: Float32Array, tableId },       interleaved re,im
 *
 * with the `[i, j]` pairs held once in a shared table rather than copied into
 * every record. Both shapes are readable here, so the two can coexist while the
 * change rolls out and a flag can be flipped without reloading.
 *
 * Why the pairs are a registry rather than one array on the store: `vis_history`
 * is not cleared between file loads (see hdf5Service), so a 24-antenna file
 * loaded after a 32-antenna one leaves records with different baseline counts in
 * the same array. Keying the table by a signature of the pairs keeps each record
 * pointing at the layout it was actually built from.
 *
 * The wire format sent to the wasm is unchanged — `toVisEntries` rebuilds the
 * `{i, j, re, im}` objects it expects, for one record per render.
 */

/** signature -> table, so identical layouts share one table. */
const tablesBySignature = new Map();
/** id -> table. */
const tablesById = new Map();

/** Signature pairs once per load; O(baselines), not O(records). */
function signatureOf(pairs) {
  let signature = String(pairs.length);
  for (const [i, j] of pairs) {
    signature += `,${i}:${j}`;
  }
  return signature;
}

/**
 * Register a baseline layout, reusing the table if an identical one exists.
 * @param {Array<[number, number]>} pairs
 * @returns {string} table id, to be stored on each record built from it
 */
export function registerBaselineTable(pairs) {
  const signature = signatureOf(pairs);
  const existing = tablesBySignature.get(signature);
  if (existing) return existing.id;

  // Pair -> index, so the amplitude/phase chart can look a baseline up directly
  // instead of scanning every record's array.
  const indexOf = new Map();
  for (const [position, [i, j]] of pairs.entries()) {
    indexOf.set(`${i}:${j}`, position);
  }

  const id = `baseline-table-${tablesById.size + 1}`;
  const table = { id, pairs, indexOf };
  tablesBySignature.set(signature, table);
  tablesById.set(id, table);
  return id;
}

/** @returns {{id: string, pairs: Array, indexOf: Map}|null} */
export function baselineTable(tableId) {
  return tablesById.get(tableId) ?? null;
}

/** Drop every registered table. Used on a telescope reset. */
export function clearBaselineTables() {
  tablesBySignature.clear();
  tablesById.clear();
}

/**
 * Pack wire-format entries into the compact representation.
 *
 * Float32Array rather than Float64Array: the HDF5 complex data is complex64, so
 * 32 bits is exact and 64 would double the memory for no precision.
 *
 * @param {Array<{i:number,j:number,re:number,im:number}>} entries
 * @returns {{values: Float32Array, tableId: string}}
 */
export function packRecordValues(entries) {
  const values = new Float32Array(entries.length * 2);
  const pairs = Array.from({ length: entries.length });

  for (const [position, entry] of entries.entries()) {
    pairs[position] = [entry.i, entry.j];
    values[position * 2] = entry.re;
    values[position * 2 + 1] = entry.im;
  }

  return { values, tableId: registerBaselineTable(pairs) };
}

/** True when a record uses the packed layout. */
export function isPacked(record) {
  return record?.values instanceof Float32Array && typeof record.tableId === "string";
}

/** Number of baselines in a record, in either layout. */
export function baselineCount(record) {
  if (!record) return 0;
  if (isPacked(record)) return record.values.length / 2;
  return Array.isArray(record.data) ? record.data.length : 0;
}

/** The `[i, j]` pairs of a record's layout. */
function pairsOf(record) {
  if (isPacked(record)) return baselineTable(record.tableId)?.pairs ?? [];
  return [];
}

/**
 * One baseline from a record, in wire shape.
 * @returns {{i:number,j:number,re:number,im:number}|null}
 */
export function entryAt(record, position) {
  if (!record || position < 0) return null;

  if (isPacked(record)) {
    const pair = pairsOf(record)[position];
    if (!pair) return null;
    return {
      i: pair[0],
      j: pair[1],
      re: record.values[position * 2],
      im: record.values[position * 2 + 1],
    };
  }

  return Array.isArray(record.data) ? (record.data[position] ?? null) : null;
}

/**
 * Rebuild the wire format the wasm expects, optionally filtered to a set of
 * antenna indices. Serde matches by field name and errors on a missing one, and
 * that error surfaces as an empty render rather than a throw — so this has to
 * produce complete entries.
 *
 * @param {Object} record
 * @param {Set<number>|null} [antennaSet] - keep only baselines between these antennas
 */
export function toVisEntries(record, antennaSet = null) {
  const count = baselineCount(record);
  const entries = [];

  for (let position = 0; position < count; position++) {
    const entry = entryAt(record, position);
    if (!entry) continue;
    if (antennaSet && !(antennaSet.has(entry.i) && antennaSet.has(entry.j))) continue;
    entries.push(entry);
  }

  return entries;
}

/**
 * Position of a baseline in a record, or -1. O(1) for packed records, which is
 * what turns the chart's per-record scan into a lookup.
 */
export function baselineIndexOf(record, i, j) {
  if (!record) return -1;

  if (isPacked(record)) {
    return baselineTable(record.tableId)?.indexOf.get(`${i}:${j}`) ?? -1;
  }

  if (!Array.isArray(record.data)) return -1;
  return record.data.findIndex((x) => x.i === i && x.j === j);
}

/** Amplitude at a baseline position, or null when the position is absent. */
export function amplitudeAt(record, position) {
  if (!record || position < 0) return null;

  if (isPacked(record)) {
    const re = record.values[position * 2];
    const im = record.values[position * 2 + 1];
    return Number.isFinite(re) && Number.isFinite(im) ? Math.hypot(re, im) : null;
  }

  const entry = Array.isArray(record.data) ? record.data[position] : null;
  return entry ? Math.hypot(entry.re, entry.im) : null;
}

/** Phase in degrees at a baseline position, or null when absent. */
export function phaseAt(record, position) {
  if (!record || position < 0) return null;

  if (isPacked(record)) {
    const re = record.values[position * 2];
    const im = record.values[position * 2 + 1];
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
    return (Math.atan2(im, re) * 180) / Math.PI;
  }

  const entry = Array.isArray(record.data) ? record.data[position] : null;
  return entry ? (Math.atan2(entry.im, entry.re) * 180) / Math.PI : null;
}
