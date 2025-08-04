<template>
  <v-card class="mx-auto" elevation="3">
    <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
      <v-icon class="mr-2">mdi-file-download</v-icon>
      Edge Cache
      <v-spacer />
      <v-tabs v-model="tab" class="ml-2" color="primary" density="compact">
        <v-tab :value="1">Visibilities</v-tab>
        <v-tab :value="2">Raw (Baseband)</v-tab>
      </v-tabs>
    </v-card-title>

    <!-- <v-card-text class="px-4"> -->
    <v-tabs-window v-model="tab">
      <v-tabs-window-item :key="1" :value="1">
        <v-container fluid>
          <v-data-table
            dense
            :headers="visHeaders"
            hide-default-footer
            hide-default-header
            :items="visFileList"
          >
            <template #item.timestamp="{ item }">
              <v-chip
                :href="TART_URL + '/' + item.filename"
                small
              >
                <v-icon left x-small> mdi-download </v-icon>
                {{ item.timestamp }}
              </v-chip>
            </template>

            <template #item.actions="{ item }">
              <v-btn
                :disabled="loadingFile && loadingFile !== item.filename"
                icon
                :loading="loadingFile === item.filename"
                small
                @click="loadVisibilityFile(item)"
              >
                <v-icon small> mdi-eye </v-icon>
              </v-btn>
            </template>

            <template #item.checksum="{ item }">
              <v-btn
                icon
                small
                @click="copyToClipboard(item.checksum)"
              >
                <v-icon small> mdi-clipboard </v-icon>
              </v-btn>
            </template>
          </v-data-table>
        </v-container>
      </v-tabs-window-item>

      <v-tabs-window-item :key="2" :value="2">
        <v-container fluid>
          <v-data-table
            dense
            :headers="rawHeaders"
            hide-default-footer
            hide-default-header
            :items="rawFileList"
          >
            <template #item.timestamp="{ item }">
              <v-chip
                :href="TART_URL + '/' + item.filename"
                small
              >
                <v-icon left x-small> mdi-download </v-icon>
                {{ item.timestamp }}
              </v-chip>
            </template>

            <template #item.checksum="{ item }">
              <v-btn
                icon
                small
                @click="copyToClipboard(item.checksum)"
              >
                <v-icon small> mdi-clipboard </v-icon>
              </v-btn>
            </template>
          </v-data-table>
        </v-container>
      </v-tabs-window-item>
    </v-tabs-window>
    <!-- </v-card-text> -->

    <v-snackbar v-model="snackbar" :timeout="1000">
      Copied sha256 checksum to clipboard
      <template #action="{ attrs }">
        <v-btn
          color="cyan"
          text
          v-bind="attrs"
          @click="snackbar = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </v-card>
</template>

<script>
  import { mapActions, mapState } from "pinia";
  import { hdf5Service } from "@/services";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "RecentData",
    emits: ['file-loaded'],
    data() {
      return {
        tab: null,
        snackbar: false,
        loadingFile: null,
        refreshInterval: null,
        visHeaders: [
          {
            text: "Timestamp",
            value: "timestamp",
            align: "left",
            sortable: false,
          },
          {
            text: "Load",
            value: "actions",
            align: "center",
            sortable: false,
            width: "80px",
          },
          {
            text: "SHA256 Checksum",
            value: "checksum",
            align: "right",
            sortable: false,
          },
        ],
        rawHeaders: [
          {
            text: "Timestamp",
            value: "timestamp",
            align: "left",
            sortable: false,
          },
          {
            text: "SHA256 Checksum",
            value: "checksum",
            align: "right",
            sortable: false,
          },
        ],
      };
    },
    mounted() {
      this.startAutoRefresh();
    },
    beforeUnmount() {
      this.stopAutoRefresh();
    },
    watch: {
      TART_URL() {
        // Refresh data when telescope changes
        this.renewVisData();
        this.renewRawData();
      },
    },
    methods: {
      ...mapActions(useAppStore, [
        "enrichBulkSatellites",
        "renewVisData",
        "renewRawData",
      ]),
      startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
          this.renewVisData();
          this.renewRawData();
        }, 10_000); // Refresh every 10 seconds
      },
      stopAutoRefresh() {
        if (this.refreshInterval) {
          clearInterval(this.refreshInterval);
          this.refreshInterval = null;
        }
      },
      copyToClipboard(text) {
        navigator.clipboard.writeText(text);
        this.snackbar = true;
      },
      async loadVisibilityFile(item) {
        try {
          this.loadingFile = item.filename;

          const fileUrl = `${this.TART_URL}/${item.filename}`;
          const file = { name: item.filename };

          await hdf5Service.loadFileToStore(
            file,
            fileUrl,
            this.store,
            this.enrichBulkSatellites,
            1 // No data thinning for edge cache files
          );

          this.$emit('file-loaded', {
            file: item,
            success: true,
            message: `Successfully loaded ${item.filename}`,
          });
        } catch (error) {
          console.error("Failed to load visibility file:", error);
          this.$emit('file-loaded', {
            file: item,
            success: false,
            error: error.message,
            message: `Failed to load ${item.filename}: ${error.message}`,
          });
        } finally {
          this.loadingFile = null;
        }
      },
    },
    computed: {
      ...mapState(useAppStore, [
        "telescope_mode",
        "visFileList",
        "rawFileList",
        "TART_URL",
      ]),
    },
    setup() {
      const store = useAppStore();
      return { store };
    },
  };
</script>
