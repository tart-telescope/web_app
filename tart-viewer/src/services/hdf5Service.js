class Hdf5Service {
  constructor() {
    this.abortController = null;
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
  async _handleRequest(operation, context = 'HDF5 request') {
    try {
      return await operation();
    } catch (error) {
      if (error.name === 'AbortError') {
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
        const { loadH5wasmFromUrl } = await import('@/utils/h5wasmUtils');

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
      const { parseH5wasmFileData } = await import('@/utils/h5wasmUtils');

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
      const {
        timestamps,
        visibilityData,
        gainPhaseData,
        antennaData,
        baselineData,
      } = parsedData;

      // Create reusable objects
      const gainRecord = gainPhaseData ? {
        gain: Array.from(gainPhaseData.gains || []),
        phase_offset: Array.from(gainPhaseData.phases || []),
        timestamp: timestamps ? timestamps[0] : null,
      } : null;

      const antennas = antennaData || null;

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
          if (
            history.some((record) => Math.abs(record.timestamp - ts) < 0.01)
          ) {
            continue;
          }

          const data = [];

          const timeStepVis = visibilityData[index];
          for (const [baselineIndex, complexVis] of timeStepVis.entries()) {
            const res = baselineData[baselineIndex];
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
          };
          history.push(visRecord);
        }

        history = history.sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
        );

        store.vis_history = history;
      }

      // Populate antenna positions
      // if (antennaData) {
      //   store.antennas = Object.freeze(antennaData);
      // }

      // if (gainRecord) {
      //   store.gain = Object.freeze(gainRecord);
      // }

      // // Populate baseline data if available
      // if (baselineData) {
      //   // Store baseline mapping for future use
      //   store.baselines = Object.freeze(baselineData);
      // }

      // // Populate config/info data - only update specific fields
      // if (configData) {
      //   const updatedInfo = { ...store.info };

      //   // Only update known info fields from configData
      //   if (configData.name) {updatedInfo.name = configData.name;}
      //   if (configData.location) {updatedInfo.location = configData.location;}
      //   if (configData.operating_frequency) {updatedInfo.operating_frequency = configData.operating_frequency;}
      //   if (configData.bandwidth) {updatedInfo.bandwidth = configData.bandwidth;}
      //   if (configData.sample_rate) {updatedInfo.sample_rate = configData.sample_rate;}
      //   if (configData.n_ant) {updatedInfo.n_ant = configData.n_ant;}

      //   store.info = Object.freeze(updatedInfo);
      // }

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
      const { parseH5wasmFileData } = await import('@/utils/h5wasmUtils');

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
      const { loadH5wasmFromUrl } = await import('@/utils/h5wasmUtils');
      return await loadH5wasmFromUrl(fileUrl);
    }, `Load HDF5 from URL: ${fileUrl}`);
  }
}

// Export a singleton instance
export default new Hdf5Service();
