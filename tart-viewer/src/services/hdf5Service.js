import { SUPPORTED_ANTENNA_COUNTS } from "@/utils/antennaConfig";

class Hdf5Service {
  constructor() {}

  /**
   * Create a new AbortController for request cancellation
   * @private
   */
  _createAbortController() {
    this.abortController = new AbortController();
  }

  /**
   * Cancel all pending requests
   */
  cancelPendingRequests() {
    if (this.abortController) {
      this.abortController.abort();
      this._createAbortController();
    }
  }

  /**
   * Handle async operations with centralized error handling
   * @private
   */
  async _handleRequest(operation, context = "HDF5 request") {
    try {
      return await operation();
    } catch (error) {
      if (error.name === "AbortError") {
        console.log(`${context} was cancelled`);
        return null;
      }
      console.error(`${context} failed:`, error);
      throw error;
    }
  }

  /**
   * Load HDF5 file from URL and populate store
   * @param {Object} file - File object with name and metadata
   * @param {string} fileUrl - URL to the HDF5 file
   * @param {Object} store - Pinia store instance
   * @param {Function} enrichBulkSatellites - Function to enrich satellite data
   * @param {number} dataThinning - Data thinning factor (default: 1)
   * @returns {Promise} Promise that resolves when file is loaded and store is populated
   */
  async loadFileToStore(file, fileUrl, store, enrichBulkSatellites, dataThinning = 1) {
    return await this._handleRequest(async () => {
      this._createAbortController();

      let hdf5File = null;
      try {
        // Import h5wasm utils
        const { loadH5wasmFromUrl } = await import("@/utils/h5wasmUtils");

        // Load HDF5 file from URL
        hdf5File = await loadH5wasmFromUrl(fileUrl);

        // Parse the file data
        await this._parseAndPopulateStore(hdf5File, file.name, store, enrichBulkSatellites, dataThinning);
      } catch (error) {
        console.error("Error loading HDF5 file:", error);
        throw new Error(`Failed to load HDF5 file: ${error.message}`);
      } finally {
        // Clean up h5file and virtual filesystem
        if (hdf5File) {
          await this._cleanupHdf5File(hdf5File);
        }
      }
    }, `Load HDF5 file: ${file.name}`);
  }

  /**
   * Parse HDF5 file and populate store with data
   * @param {Object} hdf5File - Loaded HDF5 file instance
   * @param {string} filename - Name of the file
   * @param {Object} store - Pinia store instance
   * @param {Function} enrichBulkSatellites - Function to enrich satellite data
   * @param {number} dataThinning - Data thinning factor
   * @private
   */
  async _parseAndPopulateStore(hdf5File, filename, store, enrichBulkSatellites, dataThinning = 1) {
    try {
      // Import h5wasm utils
      const { parseH5wasmFileData } = await import("@/utils/h5wasmUtils");

      // Parse the HDF5 file data
      const parsedData = await parseH5wasmFileData(hdf5File, filename);

      if (parsedData) {
        this._populateStoreWithParsedData(parsedData, store, enrichBulkSatellites, dataThinning);
      } else {
        throw new Error("Failed to parse HDF5 data - no data returned");
      }
    } catch (error) {
      console.error("Error parsing HDF5 file:", error);
      throw error; // Re-throw to allow parent to handle
    }
  }

  /**
   * Populate Pinia store with parsed HDF5 data
   * @param {Object} parsedData - Parsed data from h5wasm utilities
   * @param {Object} store - Pinia store instance
   * @param {Function} enrichBulkSatellites - Function to enrich satellite data
   * @param {number} k - Decimation factor (1=every record, 2=every 2nd, etc.)
   * @private
   */
  _populateStoreWithParsedData(parsedData, store, enrichBulkSatellites, k = 1) {
    try {
      const { timestamps, visibilityData, gainPhaseData, antennaData, baselineData, antennaConfig } = parsedData;

      // Create reusable objects
      const gainRecord = gainPhaseData
        ? {
            gain: Array.from(gainPhaseData.gains || []),
            phase_offset: Array.from(gainPhaseData.phases || []),
            timestamp: timestamps ? timestamps[0] : null,
          }
        : null;

      const antennas = antennaData || null;

      // Synchronize the store (and the UI selection state) with the array size
      // detected in the file, so 24- and 32-antenna files can be mixed.
      if (antennaConfig?.nAntennas) {
        this._applyAntennaConfig(antennaConfig, store);
      }

      // Populate visibility data
      if (timestamps && visibilityData) {
        let history = store.vis_history;
        for (const [index, timestamp] of timestamps.entries()) {
          // Apply decimation - only process every k-th record
          if (index % k !== 0) {
            continue;
          }

          const ts = new Date(timestamp);
          // skip if timestamp already exists
          if (history.some((record) => Math.abs(record.timestamp - ts) < 0.01)) {
            continue;
          }

          const data = [];

          const timeStepVis = visibilityData[index];
          for (const [baselineIndex, complexVis] of timeStepVis.entries()) {
            const res = baselineData[baselineIndex];
            if (!res) continue;
            data.push({
              i: res[0],
              j: res[1],
              re: complexVis[0],
              im: complexVis[1],
            });
          }

          const visRecord = {
            timestamp: ts,
            data,
            satellites: [],
            gain: gainRecord,
            antennas,
            nAntennas: antennaConfig?.nAntennas ?? antennas?.length ?? null,
          };
          history.push(visRecord);
        }

        history = history.toSorted((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        store.vis_history = history;
      }

      // Populate antenna positions
      if (antennas) {
        store.antennas = antennas;
      }

      if (gainRecord) {
        store.gain = gainRecord;
      }

      // Populate baseline data if available
      if (baselineData) {
        // Store baseline mapping for future use
        store.baselines = baselineData;
      }

      // Populate config/info data - only update specific fields
      if (parsedData.configData) {
        const configData = parsedData.configData;
        const updatedInfo = { ...store.info };

        if (configData.name) updatedInfo.name = configData.name;
        if (configData.location) updatedInfo.location = configData.location;
        if (configData.operating_frequency) updatedInfo.operating_frequency = configData.operating_frequency;
        if (configData.bandwidth) updatedInfo.bandwidth = configData.bandwidth;
        if (configData.sampling_frequency) updatedInfo.sampling_frequency = configData.sampling_frequency;
        if (configData.num_antenna) updatedInfo.num_antenna = configData.num_antenna;
        if (configData.lat !== undefined && configData.lon !== undefined && !updatedInfo.location) {
          updatedInfo.location = { lat: configData.lat, lon: configData.lon, alt: configData.alt };
        }

        store.info = updatedInfo;
      }

      // Enrich satellite data
      if (enrichBulkSatellites) {
        enrichBulkSatellites();
      }
    } catch (error) {
      console.error("Error populating store:", error);
      throw new Error(`Failed to populate store with data: ${error.message}`);
    }
  }

  /**
   * Reconcile store state with the array size detected in a loaded file.
   *
   * Antenna-derived state (which antennas are enabled, the selected baseline)
   * must follow the file: a 32-antenna file needs 32 enabled antennas and a
   * valid selected baseline, and switching back to a 24-antenna file must not
   * leave stale 32-antenna selections behind.
   *
   * @param {Object} antennaConfig - Detected config ({ nAntennas, nBaselines })
   * @param {Object} store - Pinia store instance
   * @private
   */
  _applyAntennaConfig(antennaConfig, store) {
    const { nAntennas } = antennaConfig;

    if (!SUPPORTED_ANTENNA_COUNTS.includes(nAntennas)) {
      console.warn(
        `Loaded file has ${nAntennas} antennas, which is outside the supported set (${SUPPORTED_ANTENNA_COUNTS.join(", ")}). Rendering may be incorrect.`,
      );
    }

    // Delegate to the store action so the UI and store stay consistent.
    if (typeof store.setAntennaCount === "function") {
      store.setAntennaCount(nAntennas);
    } else {
      store.nAntennas = nAntennas;
      store.nBaselines = antennaConfig.nBaselines;
    }
  }

  /**
   * Clean up HDF5 file and virtual filesystem
   * @param {Object} hdf5File - HDF5 file instance to clean up
   * @private
   */
  async _cleanupHdf5File(hdf5File) {
    if (!hdf5File) {
      return;
    }

    try {
      hdf5File.close();

      // Clean up virtual file if path is stored
      if (hdf5File._virtualPath) {
        const h5wasm = await import("h5wasm");
        try {
          h5wasm.FS.unlink(hdf5File._virtualPath);
        } catch (error) {
          console.warn("Could not clean up virtual file:", error);
        }
      }
    } catch (error) {
      console.warn("Error during h5file cleanup:", error);
    }
  }

  /**
   * Parse HDF5 file data only (without store population)
   * @param {Object} hdf5File - Loaded HDF5 file instance
   * @param {string} filename - Name of the file
   * @returns {Promise<Object>} Promise that resolves to parsed data
   */
  async parseFileData(hdf5File, filename) {
    return await this._handleRequest(async () => {
      const { parseH5wasmFileData } = await import("@/utils/h5wasmUtils");

      const parsedData = await parseH5wasmFileData(hdf5File, filename);

      if (!parsedData) {
        throw new Error("Failed to parse HDF5 data - no data returned");
      }

      return parsedData;
    }, `Parse HDF5 file: ${filename}`);
  }

  /**
   * Load HDF5 file from URL without store population
   * @param {string} fileUrl - URL to the HDF5 file
   * @returns {Promise<Object>} Promise that resolves to HDF5 file instance
   */
  async loadFileFromUrl(fileUrl) {
    return await this._handleRequest(async () => {
      const { loadH5wasmFromUrl } = await import("@/utils/h5wasmUtils");
      return await loadH5wasmFromUrl(fileUrl);
    }, `Load HDF5 from URL: ${fileUrl}`);
  }
  abortController = null;
}

// Export a singleton instance
export default new Hdf5Service();
