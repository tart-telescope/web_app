/**
 * H5WASM Utilities for TART HDF5 Files
 *
 * This module provides utilities for parsing TART HDF5 files using the h5wasm library.
 */

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
    const antennaData = parseAntennaData(h5file);
    const baselineData = parseBaselineData(h5file);
    const configData = parseConfigData(h5file);
    return {
      timestamps,
      visibilityData,
      gainPhaseData,
      antennaData,
      baselineData,
      configData,
      filename,
    };
  } catch (error) {
    console.error("Error parsing HDF5 file:", error);
    return null;
  }
}

function parseTimestamps(h5file) {
  const timestampDataset = h5file.get("timestamp");
  return timestampDataset.value;
}

function parseVisibilityData(h5file) {
  try {
    const visDataset = h5file.get("vis");
    const visData = visDataset.value;
    if (Array.isArray(visData)) {
      if (visData.length === 16_560) {
        const reshapedData = [];
        for (let t = 0; t < 60; t++) {
          const timeData = [];
          for (let b = 0; b < 276; b++) {
            const index = t * 276 + b;
            timeData.push(visData[index]);
          }
          reshapedData.push(timeData);
        }
        return reshapedData;
      }

      // If already 2D array
      if (visData[0] && Array.isArray(visData[0])) {
        return visData;
      }
    }

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
 * @returns {Array|null} Array of antenna positions [24×3]
 */
function parseAntennaData(h5file) {
  try {
    const antennaDataset = h5file.get("antenna_positions");
    const antennaPositions = antennaDataset.value;

    if (Array.isArray(antennaPositions) && antennaPositions.length > 0) {
      return antennaPositions;
    }

    // Handle different possible formats from h5wasm
    if (antennaPositions && typeof antennaPositions === "object") {
      // If it's a flat typed array, reshape it to 24×3
      const flatArray = Array.from(antennaPositions);
      if (flatArray.length === 72) {
        // 24 antennas × 3 coordinates
        const shaped = [];
        for (let i = 0; i < 24; i++) {
          shaped.push([
            flatArray[i * 3],
            flatArray[i * 3 + 1],
            flatArray[i * 3 + 2],
          ]);
        }
        return shaped;
      }
    }

    return antennaPositions;
  } catch (error) {
    console.error("Error parsing antenna data:", error);
    return null;
  }
}

/**
 * Parse baseline data from HDF5 file using h5wasm
 * @param {Object} h5file - H5WASM file object
 * @returns {Array|null} Array of baseline pairs [276×2]
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
    if (baselines) {
      // Handle BigInt64Array (common for baseline indices)
      if (baselines.constructor.name === "BigInt64Array") {
        const flatArray = Array.from(baselines);

        if (flatArray.length === 552) {
          // 276 baseline pairs × 2 elements each
          const baselinePairs = [];
          for (let i = 0; i < 276; i++) {
            // Convert BigInt to regular numbers for antenna indices
            const ant1 = Number(flatArray[i * 2]);
            const ant2 = Number(flatArray[i * 2 + 1]);
            baselinePairs.push([ant1, ant2]);
          }
          return baselinePairs;
        }
      }

      // Handle regular arrays or other typed arrays
      if (baselines.constructor.name.includes("Array")) {
        const flatArray = Array.from(baselines);

        if (flatArray.length === 552) {
          // 276 * 2
          const baselinePairs = [];
          for (let i = 0; i < 276; i++) {
            baselinePairs.push([flatArray[i * 2], flatArray[i * 2 + 1]]);
          }
          return baselinePairs;
        }
      }

      // If it's already a 2D array [276, 2]
      if (Array.isArray(baselines) && baselines.length === 276) {
        return baselines.map((pair) => Array.from(pair)); // Ensure regular arrays
      }
    }

    console.warn("Unexpected baseline data format:", baselines);
    console.warn(
      "Baselines are critical for visibility mapping - check data format!",
    );
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
    if (
      configData &&
      typeof configData === "object" &&
      !configData.phase_offset
    ) {
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
    const uint8Buffer =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // Create unique virtual path to avoid file caching issues
    const virtualPath = `/data_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.hdf5`;

    // Clean up any existing files first
    try {
      const existingFiles = h5wasm.FS.readdir("/").filter((f) =>
        f.endsWith(".hdf5"),
      );
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
