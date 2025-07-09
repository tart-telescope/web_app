<template>
  <v-card class="mx-auto" elevation="3">
    <v-card-title class="my-0 py-2 teal--text text--lighten-2 text-uppercase">
      HDF5 File Explorer
    </v-card-title>

    <!-- File Selection -->
    <v-card-text>
      <v-row>
        <v-col cols="12" md="6">
          <v-select
            v-model="selectedFile"
            dense
            item-title="filename"
            item-value="filename"
            :items="visFileList"
            label="Select HDF5 File"
            outlined
            @update:model-value="loadHdf5File"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props">
                <v-list-item-content>
                  <v-list-item-title>{{ item.raw.filename }}</v-list-item-title>
                  <v-list-item-subtitle>{{
                    item.raw.timestamp
                  }}</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
            </template>
          </v-select>
        </v-col>
        <v-col cols="12" md="6">
          <v-btn
            color="primary"
            :loading="loading"
            outlined
            @click="refreshFileList"
          >
            <v-icon left>mdi-refresh</v-icon>
            Refresh Files
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>

    <!-- Loading Indicator -->
    <v-card-text v-if="loading">
      <v-progress-linear color="teal" indeterminate />
      <p class="text-center mt-2">Loading and exploring HDF5 file...</p>
    </v-card-text>

    <!-- Error Display -->
    <v-alert v-if="error" class="mx-4 mb-4" dense type="error">
      {{ error }}
    </v-alert>

    <!-- File Summary -->
    <v-card-text v-if="fileSummary && !loading">
      <h4 class="teal--text text--lighten-2 mb-3">File Summary</h4>
      <v-simple-table dense>
        <tbody>
          <tr>
            <td><strong>Filename:</strong></td>
            <td>{{ fileSummary.filename }}</td>
          </tr>
          <tr>
            <td><strong>Total Groups:</strong></td>
            <td>{{ fileSummary.groups }}</td>
          </tr>
          <tr>
            <td><strong>Total Datasets:</strong></td>
            <td>{{ fileSummary.datasets }}</td>
          </tr>
          <tr v-if="fileSummary.attributes.length > 0">
            <td><strong>Root Attributes:</strong></td>
            <td>{{ fileSummary.attributes.join(", ") }}</td>
          </tr>
        </tbody>
      </v-simple-table>
    </v-card-text>

    <!-- HDF5 Structure Explorer -->
    <v-card-text v-if="hdf5Structure.length > 0 && !loading">
      <h4 class="teal--text text--lighten-2 mb-3">HDF5 Structure Explorer</h4>
      <v-treeview
        activatable
        dense
        :items="hdf5Structure"
        open-on-click
        @update:activated="onNodeActivated"
      >
        <template #prepend="{ item }">
          <v-icon v-if="item.type === 'group'" color="blue">mdi-folder</v-icon>
          <v-icon
            v-else-if="item.type === 'dataset'"
            color="green"
          >mdi-table</v-icon>
          <v-icon v-else color="grey">mdi-file</v-icon>
        </template>
        <template #label="{ item }">
          <span>{{ item.name }}</span>
          <v-chip v-if="item.shape" class="ml-2" x-small>{{
            item.shape
          }}</v-chip>
          <v-chip v-if="item.dtype" class="ml-1" color="primary" x-small>{{
            item.dtype
          }}</v-chip>
        </template>
      </v-treeview>
    </v-card-text>

    <!-- Selected Dataset Viewer -->
    <v-card-text v-if="selectedDataset && !loading">
      <h4 class="teal--text text--lighten-2 mb-3">
        Dataset: {{ selectedDataset.path }}
      </h4>

      <!-- Dataset Info -->
      <v-simple-table class="mb-4" dense>
        <tbody>
          <tr>
            <td><strong>Shape:</strong></td>
            <td>{{ selectedDataset.shape }}</td>
          </tr>
          <tr>
            <td><strong>Data Type:</strong></td>
            <td>{{ selectedDataset.dtype }}</td>
          </tr>
          <tr>
            <td><strong>Size:</strong></td>
            <td>{{ selectedDataset.size }} elements</td>
          </tr>
        </tbody>
      </v-simple-table>

      <!-- Visibility Plot for vis dataset -->
      <div v-if="selectedDataset.visualizations.visibility">
        <h6 class="mb-3">Visibility Data - Baseline {{ getBaselineInfo() }}</h6>
        <TreeshakenLineChart
          height="300"
          :options="lineChartOptions"
          :series="selectedDataset.visualizations.visibility"
          type="line"
        />
      </div>

      <!-- Other visualizations -->
      <div v-if="selectedDataset.visualizations.line">
        <h6>Line Plot</h6>
        <TreeshakenLineChart
          height="250"
          :options="lineChartOptions"
          :series="selectedDataset.visualizations.line"
          type="line"
        />
      </div>
    </v-card-text>
  </v-card>
</template>

<script>
  import axios from "axios";
  import { mapActions, mapState } from "pinia";
  import { useAppStore } from "@/stores/app";
  import TreeshakenLineChart from "./TreeshakenLineChart.vue";

  export default {
    name: "HdfViewerComponent",
    components: {
      TreeshakenLineChart,
    },
    setup() {
      const store = useAppStore();
      return { store };
    },
    data() {
      return {
        loading: false,
        error: null,
        selectedFile: null,
        hdf5File: null,
        hdf5Structure: [],
        fileSummary: null,
        selectedDataset: null,
        baselineOptions: [],
      };
    },

    computed: {
      ...mapState(useAppStore, ["visFileList", "info"]),

      TART_PROXY_URL() {
        return this.store.TART_URL;
      },
      lineChartOptions() {
        return {
          chart: { type: "line", zoom: { enabled: true } },
          xaxis: { title: { text: "Index" } },
          yaxis: { title: { text: "Value" } },
        };
      },
    },

    mounted() {
      this.refreshFileList();
    },

    methods: {
      async refreshFileList() {
      // Placeholder - implement file list loading
      },

      async loadHdf5File(filename) {
        if (!filename) return;

        this.loading = true;
        this.error = null;
        this.hdf5File = null;
        this.hdf5Structure = [];
        this.fileSummary = null;
        this.selectedDataset = null;

        try {
          const { loadH5wasmFromUrl } = await import("@/utils/h5wasmUtils");
          const file_url = `${this.TART_PROXY_URL}/${filename}`;

          this.hdf5File = await loadH5wasmFromUrl(file_url);

          this.exploreStructure();
          this.loadBaselineOptions();
          this.generateFileSummary(filename);
        } catch (error) {
          console.error("Error loading HDF5 file:", error);
          this.error = `Failed to load HDF5 file: ${error.message}`;
        } finally {
          this.loading = false;
        }
      },

      loadBaselineOptions() {
        try {
          const baselinesDataset = this.hdf5File.get("baselines");
          if (baselinesDataset && baselinesDataset.value) {
            const bl_idxs = baselinesDataset.value;
            const baselines = bl_idxs
              .filter((_, index) => index % 2 === 0)
              .map((start, index) => {
                const end = bl_idxs[index * 2 + 1];
                return [start, end];
              });
            this.baselineOptions = baselines;
            return baselines;
          }
        } catch (error) {
          console.warn("Could not load baseline options:", error);
        }
      },

      exploreStructure() {
        this.hdf5Structure = this.buildTreeStructure(this.hdf5File, "/");
      },

      buildTreeStructure(group, path = "/") {
        const items = [];

        try {
          let keys = null;
          if (group && group.keys) {
            if (Array.isArray(group.keys)) {
              keys = group.keys;
            } else if (typeof group.keys === "object") {
              keys = Object.keys(group.keys);
            }
          }

          if (!keys && group) {
            try {
              const objKeys = Object.keys(group);
              keys = objKeys.filter(
                (key) => !key.startsWith("_") && typeof group[key] !== "function",
              );
            } catch (error) {
              console.warn("Error getting Object.keys:", error);
            }
          }

          if (keys && keys.length > 0) {
            for (const key of keys) {
              const childPath = path === "/" ? `/${key}` : `${path}/${key}`;

              let child = null;
              try {
                child =
                  group.get && typeof group.get === "function"
                    ? group.get(key)
                    : group[key];
              } catch (error) {
                console.warn(`Error getting child ${key}:`, error);
              }

              if (child && child.constructor.name === "Group") {
                items.push({
                  id: childPath,
                  name: key,
                  type: "group",
                  path: childPath,
                  children: this.buildTreeStructure(child, childPath),
                });
              } else if (child && child.constructor.name === "Dataset") {
                items.push({
                  id: childPath,
                  name: key,
                  type: "dataset",
                  path: childPath,
                  shape: child.shape ? child.shape.join(" × ") : "scalar",
                  dtype: child.dtype || "unknown",
                  size: child.size || 0,
                });
              }
            }
          }
        } catch (error) {
          console.warn("Error exploring structure at", path, error);
        }

        return items;
      },

      generateFileSummary(filename) {
        let groupCount = 0;
        let datasetCount = 0;
        const attributes = [];

        const countItems = (items) => {
          for (const item of items) {
            if (item.type === "group") {
              groupCount++;
              if (item.children) countItems(item.children);
            } else if (item.type === "dataset") {
              datasetCount++;
            }
          }
        };

        countItems(this.hdf5Structure);

        try {
          if (this.hdf5File.attrs) {
            for (const attr of Object.keys(this.hdf5File.attrs)) {
              attributes.push(attr);
            }
          }
        } catch (error) {
          console.warn("Could not read root attributes:", error);
        }

        this.fileSummary = {
          filename,
          groups: groupCount,
          datasets: datasetCount,
          attributes,
        };
      },

      onNodeActivated(activated) {
        if (activated.length === 0) return;

        const nodeId = activated[0];
        const node = this.findNodeById(this.hdf5Structure, nodeId);

        if (node && node.type === "dataset") {
          this.loadDataset(node);
        }
      },

      findNodeById(items, id) {
        for (const item of items) {
          if (item.id === id) return item;
          if (item.children) {
            const found = this.findNodeById(item.children, id);
            if (found) return found;
          }
        }
        return null;
      },

      async loadDataset(node) {
        try {
          const dataset = this.hdf5File.get(node.path.slice(1));

          if (!dataset) {
            this.error = `Could not load dataset: ${node.path}`;
            return;
          }

          const data = dataset.value;
          const visualizations = this.attemptVisualizations(data, node);

          this.selectedDataset = {
            path: node.path,
            shape: node.shape,
            dtype: node.dtype,
            size: node.size,
            rawData: data,
            canVisualize: Object.keys(visualizations).length > 0,
            visualizations,
          };
        } catch (error) {
          console.error("Error loading dataset:", error);
          this.error = `Failed to load dataset ${node.path}: ${error.message}`;
        }
      },

      attemptVisualizations(data, node) {
        const visualizations = {};

        if (!data) return visualizations;

        try {
          // Special handling for visibility data
          if (
            node.name === "vis" &&
            Array.isArray(data) &&
            Array.isArray(data[0])
          ) {
            visualizations.visibility = this.createVisibilityPlot(data);
          }

          // Try line chart for 1D numerical data
          if (
            Array.isArray(data) &&
            data.length > 0 &&
            typeof data[0] === "number"
          ) {
            visualizations.line = [
              {
                name: "Data",
                data: data.map((value, index) => ({ x: index, y: value })),
              },
            ];
          }
        } catch (error) {
          console.warn("Error creating visualizations:", error);
        }

        return visualizations;
      },

      createVisibilityPlot(visData) {
        if (!visData || visData.length === 0) return null;

        const selectedAnts = this.store.selectedBaseline;
        let baselineIndex = -1;

        if (this.baselineOptions && this.baselineOptions.length > 0) {
          baselineIndex = this.baselineOptions.findIndex(
            (baseline) =>
              baseline[0] === selectedAnts[0] && baseline[1] === selectedAnts[1],
          );

          if (baselineIndex === -1) {
            baselineIndex = this.baselineOptions.findIndex(
              (baseline) =>
                baseline[0] === selectedAnts[1] &&
                baseline[1] === selectedAnts[0],
            );
          }

          if (baselineIndex === -1) {
            baselineIndex = 0;
          }
        }

        const baselineData = visData.map((row, timeIndex) => ({
          x: timeIndex,
          y: row[baselineIndex] ? Math.abs(row[baselineIndex]) : 0,
        }));

        return [
          {
            name: `Baseline ${baselineIndex} (Ant ${selectedAnts[0]} ↔ Ant ${selectedAnts[1]})`,
            data: baselineData,
          },
        ];
      },

      getBaselineInfo() {
        const selectedAnts = this.store.selectedBaseline;
        return `Ant ${selectedAnts[0]} ↔ Ant ${selectedAnts[1]}`;
      },
    },
  };
</script>

<style scoped>
.data-preview {
  font-family: monospace;
  font-size: 12px;
  max-height: 200px;
  overflow: auto;
}

.v-treeview {
  max-height: 400px;
  overflow-y: auto;
}

.v-data-table {
  max-height: 300px;
}
</style>
