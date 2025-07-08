<template>
  <v-card v-if="files.length > 0" class="mx-auto" elevation="3">
    <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
      <v-icon class="mr-2">mdi-folder</v-icon>
      Cloud Files
      <v-spacer />
      <v-chip
        color="primary"
        size="small"
        variant="flat"
      >
        Add to timeline
      </v-chip>
    </v-card-title>

    <v-card-text class="pa-2">
      <v-row>
        <v-col
          v-for="file in files"
          :key="file.name"
          cols="12"
          xl="3"
          lg="4"
          md="4"
          sm="6"
        >
          <v-card
            class="file-card"
            :disabled="loadingFile === file.name"
            :loading="loadingFile === file.name"
            @click="handleFileClick(file)"
          >
            <v-card-text class="pa-2">
              <div class="d-flex align-center mb-2">
                <v-icon
                  class="me-2"
                  :class="{ 'text-primary': loadingFile === file.name }"
                  size="large"
                >
                  {{
                    loadingFile === file.name
                      ? "mdi-loading"
                      : "mdi-file-document"
                  }}
                </v-icon>
                <div class="flex-grow-1">
                  <div class="text-body-2 font-weight-bold text-wrap">
                    {{ file.name }}
                  </div>
                </div>
              </div>
              <div class="d-flex justify-space-between align-center">
                <div class="d-flex gap-2">
                  <v-chip size="small" variant="outlined">
                    {{ formatFileSize(file.size) }}
                  </v-chip>
                  <v-chip
                    v-if="file.lastModified"
                    class="text-caption"
                    size="small"
                    variant="outlined"
                  >
                    {{ formatTimeAgo(file.lastModified) }}
                  </v-chip>
                </div>
                <v-chip
                  color="primary"
                  :href="getFileUrl(file)"
                  size="small"
                  target="_blank"
                  variant="flat"
                  @click.stop
                >
                  <v-icon size="small">mdi-download</v-icon>
                </v-chip>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script>
  import { mapActions } from "pinia";
  import { useAppStore } from "@/stores/app";
  import { loadH5wasmFromUrl, parseH5wasmFileData } from "@/utils/h5wasmUtils";

  export default {
    name: "S3Files",
    // Hardcoded S3 bucket and host/endpoint constants
    // These are used for all S3 operations in this component.
    // If you need to change the bucket or host, update these values.
    S3_BUCKET: "tart-hdf",
    S3_HOST: "s3.max.ac.nz",

    // Only accept basePath (prefix) as a prop
    props: {
      basePath: {
        type: String,
        default: "",
      },
      dataThinning: {
        type: Number,
        default: 1,
      },
    },
    emits: ['path-changed'],
    setup() {
      const store = useAppStore();
      return { store };
    },
    data() {
      return {
        // Component state for S3 file browser
        loading: false, // Boolean: true during S3 operations
        loadingFile: null, // String: filename being processed, null when not loading
        error: null, // String: error message to display
        files: [], // Array: file objects from S3 listing
        folders: [], // Array: folder/prefix names
        currentPrefix: this.basePath, // String: current S3 prefix being viewed
        allFiles: [], // Array: combined files from both days

      };
    },
    // Watchers for reactive data changes
    watch: {
      basePath(newPath) {
        this.currentPrefix = newPath;
        this.fetchLast24Hours();
      },
      currentPrefix() {
        this.$emit("path-changed", this.currentPrefix);
      },
      dataThinning() {
        this.fetchLast24Hours();
      },
    },
    computed: {
      tomorrowDate() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      },
      todayDate() {
        return new Date();
      },
      yesterdayDate() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
      },
    },

    // Lifecycle hooks
    mounted() {
      this.fetchLast24Hours();
    },
    methods: {
      ...mapActions(useAppStore, [
        "enrichBulkSatellites",
      ]),
      /**
       * Fetch files from last 24 hours (today + yesterday)
       * Combines results from both days and sorts by date
       */
      async fetchLast24Hours() {
        this.loading = true;
        this.error = null;
        this.files = [];
        this.folders = [];
        this.allFiles = [];
        const minDesiredFiles = 50; // Adjust this threshold as needed

        try {
          const tomorrowPrefix = this.generateDatePrefix(this.tomorrowDate);
          const todayPrefix = this.generateDatePrefix(this.todayDate);
          const yesterdayPrefix = this.generateDatePrefix(this.yesterdayDate);

          const tomorrowFiles = await this.fetchSingleDay(tomorrowPrefix);
          const todayFiles = await this.fetchSingleDay(todayPrefix);
          let yesterdayFiles = [];
          if (todayFiles.length < minDesiredFiles) {
            yesterdayFiles = await this.fetchSingleDay(yesterdayPrefix);
          }

          // Combine all files
          this.allFiles = [...tomorrowFiles, ...todayFiles, ...yesterdayFiles];

          // Sort by lastModified date (newest first) and limit to 50
          this.allFiles.sort((a, b) => {
            if (!a.lastModified && !b.lastModified) return 0;
            if (!a.lastModified) return 1;
            if (!b.lastModified) return -1;
            return new Date(b.lastModified) - new Date(a.lastModified);
          });

          // Apply data thinning
          let thinnedFiles = this.allFiles;
          if (this.dataThinning > 1) {
            thinnedFiles = this.allFiles.filter((_, index) => index % this.dataThinning === 0);
          }

          const totalFiles = thinnedFiles.length;
          this.files = thinnedFiles.slice(0, minDesiredFiles);

          this.loading = false;
        } catch (error) {
          this.handleS3Error(error);
        }
      },

      /**
       * Fetch files for a single day
       * @param {String} prefix - S3 prefix for the day
       * @returns {Array} Array of file objects
       */
      async fetchSingleDay(prefix) {
        try {
          const params = new URLSearchParams({
            "list-type": "2",
            delimiter: "/",
            prefix: prefix,
          });

          const url = `https://${this.$options.S3_HOST}/${this.$options.S3_BUCKET}?${params}`;
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`Failed to fetch ${prefix}: HTTP ${response.status}`);
            return [];
          }

          const xmlText = await response.text();
          return this.parseS3ResponseForFiles(xmlText, prefix);
        } catch (error) {
          console.warn(`Error fetching ${prefix}:`, error);
          return [];
        }
      },

      /**
       * Generate S3 prefix for a given date
       * @param {Date} date - Date to generate prefix for
       * @returns {String} S3 prefix
       */
      generateDatePrefix(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // Extract telescope from basePath or use default
        const basePathPart = this.basePath
          .split("/")
          .find((part) => part.length > 0);
        const telescope = basePathPart || "zm-cbu";

        return `${telescope}/vis/${year}/${month}/${day}/`;
      },

      /**
       * Parse S3 XML response and extract only files (for single day fetch)
       * @param {String} xmlText - XML response from S3 list operation
       * @param {String} prefix - The prefix used for this request
       * @returns {Array} Array of file objects
       */
      parseS3ResponseForFiles(xmlText, prefix) {
        const files = [];

        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");

          // Parse files (Contents elements)
          const contents = xmlDoc.querySelectorAll("Contents");
          for (const content of contents) {
            const key = content.querySelectorAll("Key")[0]?.textContent;
            const size = content.querySelectorAll("Size")[0]?.textContent;
            const lastModified =
              content.querySelectorAll("LastModified")[0]?.textContent;

            if (key) {
              const fileName = key.replace(prefix, "");
              if (fileName && !fileName.includes("/")) {
                files.push({
                  name: fileName,
                  size: Number.parseInt(size) || 0,
                  lastModified: lastModified ? new Date(lastModified) : null,
                  fullPath: key, // Keep full path for URL generation
                });
              }
            }
          }
          return files;
        } catch (error) {
          console.error("Error parsing S3 XML response:", error);
          return [];
        }
      },

      /**
       * Handle S3 operation errors
       * @param {Error} error - S3 or network error
       */
      handleS3Error(error) {
        this.loading = false;
        this.error = `Failed to load files: ${error.message}`;
        console.error("S3 Error:", error);
      },

      /**
       * Navigate into a folder (update prefix and refetch)
       * @param {String} folderName - Name of folder to navigate into
       */
      navigateToFolder(folderName) {
        this.currentPrefix = this.currentPrefix + folderName + "/";
        this.fetchListing();
      },

      /**
       * Generate public URL for file download/view
       * @param {String} fileName - Name of file
       * @returns {String} Direct HTTP URL to file
       */
      getFileUrl(fileName) {
        // Find the file in allFiles to get its full path
        const file = this.allFiles.find((f) => f.name === fileName);
        if (file && file.fullPath) {
          return `https://${this.$options.S3_HOST}/${this.$options.S3_BUCKET}/${file.fullPath}`;
        }
        // Fallback to current prefix (shouldn't happen with 24h view)
        return `https://${this.$options.S3_HOST}/${this.$options.S3_BUCKET}/${this.currentPrefix}${fileName}`;
      },

      /**
       * Handle file card click - load HDF5 if applicable (no download)
       * @param {Object} file - S3 file object
       */
      async handleFileClick(file) {
        // this.$emit("file-selected", {
        //   file: file,
        //   url: this.getFileUrl(file.name),
        //   path: this.currentPrefix,
        // });

        // If it's an HDF5 file, try to load it in memory and populate store
        if (file.name.endsWith(".hdf") || file.name.endsWith(".h5")) {
          try {
            this.loadingFile = file.name;
            await this.loadHdf5FileToStore(file);

          // Emit success event for parent component to show feedback
          // this.$emit("file-loaded", {
          //   file: file,
          //   success: true,
          //   message: `Successfully loaded ${file.name}`,
          // });
          } catch (error) {
            console.error("Failed to load HDF5 file:", error);

          // Emit error event for parent component to show error feedback
          // this.$emit("file-loaded", {
          //   file: file,
          //   success: false,
          //   error: error.message,
          //   message: `Failed to load ${file.name}: ${error.message}`,
          // });
          } finally {
            this.loadingFile = null;
          }
        }
      },


      async loadHdf5FileToStore(file) {
        let hdf5File = null;
        try {
          const fileUrl = this.getFileUrl(file.name);
          hdf5File = await loadH5wasmFromUrl(fileUrl);
          // Then, parse and extract the data
          await this.fileParsing(hdf5File, file.name);

        } catch (error) {
          console.error("Error loading HDF5 file:", error);
          throw new Error(`Failed to load HDF5 file: ${error.message}`);
        } finally {
          // Clean up h5file and virtual filesystem
          if (hdf5File) {
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
        }
      },

      async fileParsing(hdf5File, filename) {
        try {
          const parsedData = await parseH5wasmFileData(hdf5File, filename);

          if (parsedData) {
            this.populateStoreWithParsedData(parsedData, this.thinningFactor);
          } else {
            throw new Error("Failed to parse HDF5 data - no data returned");
          }
        } catch (error) {
          console.error("Error parsing HDF5 file:", error);
          throw error; // Re-throw to allow parent to handle
        }
      },

      /**
       * Populate Pinia store with parsed HDF5 data
       * @param {Object} parsedData - Parsed data from h5wasm utilities
       * @param {Number} k - Decimation factor (1=every record, 2=every 2nd, etc.)
       */
      populateStoreWithParsedData(parsedData, k = 1) {
        try {
          const {
            timestamps,
            visibilityData,
            gainPhaseData,
            antennaData,
            configData,
            baselineData,
            filename,
          } = parsedData;

          // Populate visibility data
          if (timestamps && visibilityData) {
            let history = this.store.vis_history;
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
                data: data,
                satellites: [],
              };
              history.push(visRecord);
            }

            history = history.sort(
              (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
            );

            this.store.vis_history = history;
          }

          // Populate antenna positions
          if (antennaData) {
            this.store.antennas = Object.freeze(antennaData);
          }

          if (gainPhaseData) {
            const gainRecord = {
              gain: Array.from(gainPhaseData.gains || []),
              phase_offset: Array.from(gainPhaseData.phases || []),
              timestamp: timestamps ? timestamps[0] : null,
            };

            this.store.gain = Object.freeze(gainRecord);
          }

          // Populate baseline data if available
          if (baselineData) {
            // Store baseline mapping for future use
            this.store.baselines = Object.freeze(baselineData);
          }

          // Populate config/info data
          if (configData) {
            this.store.info = Object.freeze({
              ...this.store.info,
              ...configData,
            });
          }
          this.enrichBulkSatellites();


        } catch (error) {
          console.error("Error populating store:", error);
          throw new Error(`Failed to populate store with data: ${error.message}`);
        }
      },

      formatFileSize(bytes) {
        if (!bytes) return "0 B";
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (
          Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i]
        );
      },

      formatDate(date) {
        if (!date) return "";
        const d = new Date(date);
        return d.toLocaleDateString() + " " + d.toLocaleTimeString();
      },

      formatTimeAgo(date) {
        if (!date) return "";
        const now = new Date();
        const diff = now - new Date(date);
        const minutes = Math.floor(diff / 60_000);
        const hours = Math.floor(diff / 3_600_000);
        const days = Math.floor(diff / 86_400_000);

        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 30) return `${days}d ago`;
        return new Date(date).toLocaleDateString();
      },

      formatDateOnly(date) {
        if (!date) return "";
        return new Date(date).toLocaleDateString();
      },
    },
  };
</script>

<style scoped>
.file-card {
  border: 2px solid transparent;
}

.file-card:hover:not([disabled]) {
  border-color: rgb(var(--v-theme-primary));
}
</style>
