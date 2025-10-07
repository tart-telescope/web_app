<template>
  <v-card v-if="files.length > 0" class="mx-auto" elevation="3">
    <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
      <v-icon class="mr-2">mdi-folder</v-icon>
      Cloud Files
      <v-spacer />
      <v-chip
        color="primary"
        :disabled="bulkLoading || enrichLoading"
        size="small"
        variant="flat"
        @click="addToTimeline"
      >
        <v-icon v-if="bulkLoading || enrichLoading" class="mr-1">mdi-loading mdi-spin</v-icon>
        <span v-if="enrichLoading">
          Enriching satellites...
        </span>
        <span v-else-if="bulkLoading">
          {{ bulkPhase === 'loading' ? 'Loading files' : 'Enriching satellites' }} ({{ bulkProgress }}/{{ bulkTotal }})
        </span>
        <span v-else>
          Add to timeline
        </span>
      </v-chip>
    </v-card-title>

    <v-card-text class="pa-2">
      <v-row>
        <v-col
          v-for="file in files"
          :key="file.name"
          cols="12"
          lg="4"
          md="4"
          sm="6"
          xl="3"
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
                  :href="getFileUrl(file.name)"
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
  import { hdf5Service, s3Service } from "@/services";
  import { useAppStore } from "@/stores/app";
  import { formatFileSize, formatTimeAgo } from "@/utils/format";

  export default {
    name: "S3Files",
    // Only accept basePath (prefix) as a prop
    props: {
      basePath: {
        type: String,
        default: "",
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
        refreshInterval: null, // Timer for auto-refresh
        bulkLoading: false, // Boolean: true during bulk timeline loading
        bulkProgress: 0, // Number: current file being processed in bulk load
        bulkTotal: 0, // Number: total files to process in bulk load
        bulkPhase: 'loading', // String: current phase of bulk operation ('loading' or 'enriching')
        enrichLoading: false, // Boolean: true during satellite enrichment

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

    },
    computed: {},

    // Lifecycle hooks
    mounted() {
      s3Service.setConfig("", "tart.s3.us-west-2.amazonaws.com");

      this.fetchLast24Hours();
      this.startAutoRefresh();
    },
    beforeUnmount() {
      this.stopAutoRefresh();
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
          const result = await s3Service.fetchLast24Hours(this.basePath, minDesiredFiles);

          if (result) {
            this.files = result.files;
            this.allFiles = result.allFiles;
          }

          this.loading = false;
        } catch (error) {
          this.handleS3Error(error);
        }
      },
      handleS3Error(error) {
        this.loading = false;
        this.error = `Failed to load files: ${error.message}`;
        console.error("S3 Error:", error);
      },
      navigateToFolder(folderName) {
        this.currentPrefix = this.currentPrefix + folderName + "/";
        this.fetchLast24Hours();
      },
      getFileUrl(fileName) {
        return s3Service.getFileUrl(fileName, this.allFiles, this.currentPrefix);
      },
      async handleFileClick(file) {
        if (file.name.endsWith(".hdf") || file.name.endsWith(".h5")) {
          try {
            this.loadingFile = file.name;
            const fileUrl = this.getFileUrl(file.name);
            await hdf5Service.loadFileToStore(
              file,
              fileUrl,
              this.store,
              () => this.enrichSatellitesWithProgress(),
              1
            );
          } catch (error) {
            console.error("Failed to load HDF5 file:", error);
          } finally {
            this.loadingFile = null;
          }
        }
      },

      async enrichSatellitesWithProgress() {
        if (this.enrichLoading) return;

        this.enrichLoading = true;

        try {
          const result = await this.enrichBulkSatellites();

          if (result && !result.success) {
            console.warn('Satellite enrichment completed with errors:', result);
          }
        } catch (error) {
          console.error('Failed to enrich satellites:', error);
        } finally {
          this.enrichLoading = false;
        }
      },



      formatFileSize,
      formatTimeAgo,

      async addToTimeline() {
        if (this.bulkLoading) return;

        const maxFiles = 30;
        const hdf5Files = this.allFiles
          .filter(file => file.name.endsWith(".hdf") || file.name.endsWith(".h5"))
          .slice(0, maxFiles);

        if (hdf5Files.length === 0) {
          console.warn("No HDF5 files found to add to timeline");
          return;
        }

        this.bulkLoading = true;
        this.bulkProgress = 0;
        this.bulkTotal = hdf5Files.length;
        this.bulkPhase = 'loading';

        try {
          // Load all files first without enrichment
          for (const [index, file] of hdf5Files.entries()) {
            this.bulkProgress = index + 1;

            try {
              const fileUrl = this.getFileUrl(file.name);
              await hdf5Service.loadFileToStore(
                file,
                fileUrl,
                this.store,
                null, // Don't enrich after each file
                10
              );

              // Small delay to prevent UI blocking
              await new Promise(resolve => setTimeout(resolve, 10));
            } catch (error) {
              console.error(`Failed to load file ${file.name}:`, error);
              // Continue with next file instead of stopping
            }
          }

          // Now enrich all satellites in one bulk operation
          this.bulkPhase = 'enriching';
          this.bulkProgress = 0;
          this.bulkTotal = 1; // Just one enrichment operation
          await this.enrichSatellitesWithProgress();
          this.bulkProgress = 1;

        } finally {
          this.bulkLoading = false;
          this.bulkProgress = 0;
          this.bulkTotal = 0;
          this.bulkPhase = 'loading';
        }
      },

      startAutoRefresh() {
        // Refresh every 5 minutes (300,000 ms)
        this.refreshInterval = setInterval(() => {
          if (!this.loading) {
            this.fetchLast24Hours();
          }
        }, 300_000);
      },

      stopAutoRefresh() {
        if (this.refreshInterval) {
          clearInterval(this.refreshInterval);
          this.refreshInterval = null;
        }
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

.mdi-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
