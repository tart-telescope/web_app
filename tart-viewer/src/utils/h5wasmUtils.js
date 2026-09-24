/**
 * H5WASM Utilities for TART HDF5 Files
 *
 * This module provides utilities for parsing TART HDF5 files using the h5wasm library.
 *
 * Array sizes vary between deployments (24 or 32 antennas), so parsing never
 * assumes 24 antennas / 276 baselines. The antenna count is detected from the
 * file contents (baselines, vis shape, config, gains) instead.
 */

import { detectAntennaConfig, reshapeAntennaPositions, reshapeVisData } from "./antennaConfig";

/**
 * Parse H5WASM file data and extract all structured data
 * @param {Object} h5file - H5WASM file object
 * @param {String} filename - Original filename
 * @returns {Object|null} Parsed data object
 */
export async function parseH5wasmFileData(h5file, filename) {
  try {
    const timestamps = parseTimestamps(h5file);
    const visibilityData = parseVisibilityData(h5file);
    const gainPhaseData = parseGainPhaseData(h5file);
    const baselineData = parseBaselineData(h5file);
    const configData = parseConfigData(h5file);

    // Detect the array size up front so antenna positions and vis data can be
    // reshaped for either 24 or 32 (or any full-correlation) antenna layout.
    const antennaConfig = detectAntennaConfig({
      baselines: baselineData,
      visibilityData,
      configData,
      gainPhaseData,
    });

    const antennaData = parseAntennaData(h5file, antennaConfig);

    // Reshape vis data if it came back flat/timeseries. The old parser keyed off
    // a single hardcoded flat length (16,560), which only matched 24 antennas;
    // here the expected either-or is expressed in terms of the detected sizes.
    const reshapedVisibilityData = maybeReshapeVisData(visibilityData, timestamps, antennaConfig.nBaselines);

    if (antennaConfig.nAntennas) {
      console.info(
        `HDF5 ${filename}: detected ${antennaConfig.nAntennas} antennas / ${antennaConfig.nBaselines} baselines (source: ${antennaConfig.source})`,
      );
    } else {
      console.warn(`HDF5 ${filename}: could not determine antenna count from file contents`);
    }

    return {
      timestamps,
      visibilityData: reshapedVisibilityData,
      gainPhaseData,
      antennaData,
      baselineData,
      configData,
      antennaConfig,
      filename,
    };
  } catch (error) {
    console.error("Error parsing HDF5 file:", error);
    return null;
  }
}

/**
 * Reshape flat visibility data into [nTimes, nBaselines] when possible.
 *
 * Returns the input untouched when it is already a 2-D matrix, or when the
 * shape cannot be reconciled with the detected baseline count.
 *
 * @param {Array|TypedArray} visData
 * @param {Array} timestamps
 * @param {number|null} nBaselines
 * @returns {Array|TypedArray}
 */
function maybeReshapeVisData(visData, timestamps, nBaselines) {
  if (!visData || !timestamps) return visData;

  // Already [nTimes, nBaselines]: rows are arrays of per-baseline entries.
  if (Array.isArray(visData) && visData.length === timestamps.length && Array.isArray(visData[0])) {
    const rowLength = visData[0].length;
    // A [nTimes, nBaselines] matrix has rows of length nBaselines. A flat
    // [nTimes*nBaselines] array has rows that are [re, im] pairs (length 2).
    if (!nBaselines || rowLength === nBaselines) return visData;
  }

  if (!nBaselines) return visData;

  const flatLength = visData.length;
  if (flatLength === timestamps.length * nBaselines) {
    return reshapeVisData(visData, timestamps.length, nBaselines);
  }

  console.warn(
    `Visibility data length ${flatLength} does not match ${timestamps.length} timestamps x ${nBaselines} baselines; using data as-is.`,
  );
  return visData;
}

function parseTimestamps(h5file) {
  const timestampDataset = h5file.get("timestamp");
  return timestampDataset.value;
}

function parseVisibilityData(h5file) {
  try {
    const visDataset = h5file.get("vis");
    const visData = visDataset.value;

    // Already a 2D array ([nTimes, nBaselines]) - return as-is.
    if (Array.isArray(visData) && visData[0] && Array.isArray(visData[0])) {
      return visData;
    }

    // Flat data is reshaped later, once the baseline count has been detected.
    return visData;
  } catch (error) {
    console.error("Error parsing visibility data:", error);
    return null;
  }
}

/**
 * Parse gain and phase data from HDF5 file using h5wasm
 * @param {Object} h5file - H5WASM file object
 * @returns {Object|null} Gain/phase data object
 */
function parseGainPhaseData(h5file) {
  try {
    const keys = h5file.keys();
    const gainsDataset = keys.includes("gains") ? h5file.get("gains") : null;
    const phasesDataset = keys.includes("phases") ? h5file.get("phases") : null;

    let gains = null;
    let phases = null;

    // Extract gains
    if (gainsDataset) {
      const gainsRaw = gainsDataset.value;
      gains = Array.isArray(gainsRaw) ? gainsRaw : Array.from(gainsRaw);
    }

    // Extract phases (separate dataset)
    if (phasesDataset) {
      const phasesRaw = phasesDataset.value;
      phases = Array.isArray(phasesRaw) ? phasesRaw : Array.from(phasesRaw);
    }

    return {
      gains: gains || [],
      phases: phases || [],
    };
  } catch (error) {
    console.error("Error parsing gain/phase data:", error);
    return null;
  }
}

/**
 * Parse antenna position data from HDF5 file using h5wasm
 * @param {Object} h5file - H5WASM file object
 * @param {Object} [antennaConfig] - Detected antenna config ({ nAntennas, ... })
 * @returns {Array|null} Array of antenna positions [N×3]
 */
function parseAntennaData(h5file, antennaConfig = {}) {
  try {
    const antennaDataset = h5file.get("antenna_positions");
    const antennaPositions = antennaDataset.value;

    if (Array.isArray(antennaPositions) && antennaPositions.length > 0) {
      return antennaPositions;
    }

    // Handle different possible formats from h5wasm: a flat typed array of
    // N×3 coordinates is reshaped using the detected antenna count.
    if (antennaPositions && typeof antennaPositions === "object") {
      const nAntennas = antennaConfig.nAntennas;
      const flatArray = Array.from(antennaPositions);
      if ((nAntennas && flatArray.length === nAntennas * 3) || flatArray.length % 3 === 0) {
        const count = nAntennas || flatArray.length / 3;
        return reshapeAntennaPositions(flatArray, count);
      }
    }

    return antennaPositions;
  } catch (error) {
    console.error("Error parsing antenna data:", error);
    return null;
  }
}

/**
 * Reshape a flat baseline array ([nBaselines × 2]) into pairs of antenna indices.
 * @param {Array|TypedArray} flatArray
 * @returns {Array} Array of [ant1, ant2] pairs
 */
function pairsFromFlatBaselines(flatArray) {
  const pairs = [];
  for (let i = 0; i + 1 < flatArray.length; i += 2) {
    // Number() also converts BigInt values from BigInt64Array
    const ant1 = Number(flatArray[i]);
    const ant2 = Number(flatArray[i + 1]);
    if (Number.isFinite(ant1) && Number.isFinite(ant2)) {
      pairs.push([ant1, ant2]);
    }
  }
  return pairs;
}

/**
 * Convert a single [ant1, ant2] entry to an array of plain numbers.
 * Handles nested typed arrays (e.g. BigInt64Array rows from h5wasm).
 * @param {Array|TypedArray} pair
 * @returns {Array} [ant1, ant2]
 */
function normalizePair(pair) {
  const arr = Array.from(pair, Number);
  return [arr[0], arr[1]];
}

/**
 * True when the value looks like a list of [ant1, ant2] rows rather than a
 * flat list of scalar antenna indices.
 * @param {*} baselines
 * @returns {boolean}
 */
function isNestedBaselines(baselines) {
  if (!Array.isArray(baselines) || baselines.length === 0) return false;
  const first = baselines[0];
  if (Array.isArray(first)) return true;
  // Typed arrays (Float64Array/Int32Array) — a row of 2 indices, NOT a scalar
  if (ArrayBuffer.isView(first)) return first.length === 2;
  return false;
}

/**
 * Parse baseline data from HDF5 file using h5wasm.
 *
 * The number of baselines is whatever the file contains (276 for 24 antennas,
 * 496 for 32 antennas, ...), so it is never assumed here.
 *
 * @param {Object} h5file - H5WASM file object
 * @returns {Array|null} Array of baseline pairs [nBaselines×2]
 */
function parseBaselineData(h5file) {
  try {
    const keys = h5file.keys();
    if (!keys.includes("baselines")) {
      console.warn("No baselines dataset found");
      return null;
    }

    const baselineDataset = h5file.get("baselines");
    const baselines = baselineDataset.value;

    if (!baselines) {
      console.warn("No baseline data found - baselines are critical for visibility mapping");
      return null;
    }

    // Already a list of [ant1, ant2] rows (any length). h5wasm may return each
    // row as a plain array OR a 2-element typed array, so detect both.
    if (isNestedBaselines(baselines)) {
      return baselines.map((pair) => normalizePair(pair));
    }

    // Flat scalar array ([ant1, ant2, ant1, ant2, ...]) or a 1-D typed array
    // such as BigInt64Array: length = nBaselines * 2.
    const flatArray = Array.from(baselines, Number);
    if (flatArray.length > 0 && flatArray.length % 2 === 0) {
      return pairsFromFlatBaselines(flatArray);
    }

    console.warn("Unexpected baseline data format:", baselines);
    console.warn("Baselines are critical for visibility mapping - check data format!");
    return baselines;
  } catch (error) {
    console.error("Error parsing baseline data:", error);
    return null;
  }
}

/**
 * Parse config/metadata from HDF5 file using h5wasm
 * @param {Object} h5file - H5WASM file object
 * @returns {Object|null} Configuration object
 */
function parseConfigData(h5file) {
  try {
    const configDataset = h5file.get("config");
    const configData = configDataset.value;

    if (Array.isArray(configData)) {
      // Try to parse as JSON if it's an array of strings
      try {
        const parsedConfigs = configData.map((item) => {
          if (typeof item === "string") {
            const parsed = JSON.parse(item);
            // Add phase_offset field if missing (HDF5 vs application compatibility)
            if (parsed && typeof parsed === "object" && !parsed.phase_offset) {
              parsed.phase_offset = parsed.phases || [];
            }
            return parsed;
          }
          return item;
        });
        // If it's an array of one item, return that item
        return parsedConfigs.length === 1 ? parsedConfigs[0] : parsedConfigs;
      } catch {
        console.warn("Could not parse config array as JSON");
        return { config: configData };
      }
    } else if (typeof configData === "string") {
      try {
        const parsed = JSON.parse(configData);
        // Add phase_offset field if missing (HDF5 vs application compatibility)
        if (parsed && typeof parsed === "object" && !parsed.phase_offset) {
          parsed.phase_offset = parsed.phases || [];
        }
        return parsed;
      } catch {
        console.warn("Could not parse config as JSON");
        return { config: configData };
      }
    }

    // For object configs, also add phase_offset if missing
    if (configData && typeof configData === "object" && !configData.phase_offset) {
      configData.phase_offset = configData.phases || [];
    }

    return configData;
  } catch (error) {
    console.error("Error parsing config data:", error);
    return null;
  }
}

/**
 * Load HDF5 file from buffer and return h5file object using h5wasm
 * @param {Buffer|Uint8Array} buffer - File buffer
 * @returns {Object} h5wasm File object
 */
export async function loadH5wasmFromBuffer(buffer) {
  try {
    const h5wasm = await import("h5wasm");
    if (h5wasm.ready) {
      await h5wasm.ready;
    }
    const uint8Buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // Create unique virtual path to avoid file caching issues
    const virtualPath = `/data_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.hdf5`;

    // Clean up any existing files first
    try {
      const existingFiles = h5wasm.FS.readdir("/").filter((f) => f.endsWith(".hdf5"));
      for (const file of existingFiles) {
        try {
          h5wasm.FS.unlink("/" + file);
        } catch {
          console.warn("Could not clean up file:", file);
        }
      }
    } catch {
      console.warn("Could not clean up existing files");
    }

    // Write buffer to virtual filesystem with unique name
    h5wasm.FS.writeFile(virtualPath, uint8Buffer);

    // Open file from virtual filesystem
    const h5file = new h5wasm.File(virtualPath, "r");

    // Store the virtual path for cleanup later
    h5file._virtualPath = virtualPath;

    return h5file;
  } catch (error) {
    console.error("Error loading HDF5 file from buffer:", error);
    throw error;
  }
}

export async function loadH5wasmFromUrl(fileUrl) {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Received empty or invalid file data");
    }

    // Convert to Uint8Array for h5wasm
    const uint8Buffer = new Uint8Array(arrayBuffer);

    const h5file = await loadH5wasmFromBuffer(uint8Buffer);

    return h5file;
  } catch (error) {
    console.error("Error loading HDF5 file from URL:", error);
    throw error;
  }
}
