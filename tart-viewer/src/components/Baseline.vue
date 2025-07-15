<template>
  <v-card class="mx-auto" elevation="3">
    <div class="card-content">
      <!-- Chart content area with consistent height -->
      <div class="chart-content">
        <!-- Show skeleton loader when insufficient data -->
        <div v-if="filteredData.length < 2" class="loading-container">
          <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
            <v-icon class="mr-2">mdi-chart-line</v-icon>
            Visibility Amplitude
          </v-card-title>
          <div class="chart-container">
            <v-skeleton-loader
              type="image"
              height="150"
              class="chart-skeleton"
            />
          </div>

          <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
            <v-icon class="mr-2">mdi-chart-timeline-variant</v-icon>
            Visibility Phase
          </v-card-title>
          <div class="chart-container">
            <v-skeleton-loader
              type="image"
              height="150"
              class="chart-skeleton"
            />
          </div>

          <div class="zoom-controls">
            <v-skeleton-loader type="button" width="100" />
            <span class="mx-2">Waiting for more data...</span>
          </div>
        </div>

        <!-- Show charts when sufficient data -->
        <div v-else>
        <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
          <v-icon class="mr-2">mdi-chart-line</v-icon>
          Visibility Amplitude
          <v-spacer />
          <v-chip
            v-if="hasNewData"
            color="primary"
            size="small"
            variant="outlined"
            class="mr-2"
          >
            New Data
          </v-chip>
          <v-btn size="small" @click="resetZoom">Reset Zoom</v-btn>
        </v-card-title>
        <div class="chart-container">
          <UPlotChart
            ref="amplitudeChart"
            :height="150"
            :series="amplitudeSeries"
            sync-key="baseline-charts"
            timezone="UTC"
            @mouse-leave="clearHoveredTimestamp"
            @mouse-move="handleUPlotHover"
            @zoom-changed="updateZoomRange"
          />
        </div>

        <div class="chart-container">
          <v-icon class="mr-2">mdi-chart-line</v-icon>

          <UPlotChart
            ref="phaseChart"
            :height="150"
            :series="phaseSeries"
            sync-key="baseline-charts"
            timezone="UTC"
            @mouse-leave="clearHoveredTimestamp"
            @mouse-move="handleUPlotHover"
            @zoom-changed="updateZoomRange"
          />
        </div>

        <!-- Zoom controls -->
        <div class="zoom-controls">
          <span class="mx-2">Drag to zoom on timeline</span>
        </div>


        </div>
      </div>

      <!-- Baseline selection slider - always at bottom -->
      <v-card-actions class="pb-0">
        <v-range-slider
          v-model="selected_baseline"
          label="Baseline"
          max="23"
          min="0"
          outlined
          step="1"
          thumb-label="always"
          :thumb-size="20"
          @update:model-value="selectBaseline"
        />
      </v-card-actions>
    </div>
  </v-card>
</template>

<script lang="js">
  import { mapActions, mapState } from "pinia";
  import { useAppStore } from "@/stores/app";
  import UPlotChart from "./UPlotChart.vue";

  export default {
    name: "BaselineComponent",
    components: { UPlotChart },

    data() {
      return {
        selected_baseline: [0, 23],
        currentZoomRange: null,
      };
    },

    computed: {
      ...mapState(useAppStore, ["vis_history"]),

      // Get filtered data once and reuse
      filteredData() {
        if (this.vis_history.length === 0) return [];

        const [i, j] = this.selected_baseline;
        return this.vis_history.map((x_h, idx) => {
          const item = x_h.data ? x_h.data.find((x) => x.i === i && x.j === j) : null;
          return {
            timestamp: x_h.timestamp,
            amplitude: item ? Math.hypot(item.re, item.im) : null,
            phase: item ? (Math.atan2(item.im, item.re) * 180) / Math.PI : null,
          };
        });
      },

      amplitudeSeries() {
        return [
          {
            name: "Amplitude",
            data: this.filteredData.map((d) => ({
              x: d.timestamp,
              y: d.amplitude?.toFixed(3) || null,
            })),
          },
        ];
      },

      phaseSeries() {
        return [
          {
            name: "Phase",
            data: this.filteredData.map((d) => ({
              x: d.timestamp,
              y: d.phase?.toFixed(0) || null,
            })),
          },
        ];
      },

      hasNewData() {
        if (!this.currentZoomRange || this.filteredData.length === 0) return false;
        
        const latestDataTimestamp = Math.max(...this.filteredData.map(d => d.timestamp));
        const zoomMaxTimestamp = this.currentZoomRange.max * 1000; // Convert from seconds to milliseconds
        
        return latestDataTimestamp > zoomMaxTimestamp;
      },

    },

    methods: {
      ...mapActions(useAppStore, [
        "selectBaseline",
        "setHoveredTimestamp",
        "clearHoveredTimestamp",
      ]),

      handleUPlotHover(event) {
        if (event.idx !== undefined && event.idx !== null && event.idx < this.filteredData.length) {
          const data = this.filteredData[event.idx];
          
          if (data) {
            // Set hovered timestamp for other components
            this.setHoveredTimestamp(data.timestamp);
          }
        }
      },

      clearHoveredTimestamp() {
        this.setHoveredTimestamp(null);
      },

      resetZoom() {
        if (this.$refs.amplitudeChart) {
          this.$refs.amplitudeChart.resetZoom();
        }
        if (this.$refs.phaseChart) {
          this.$refs.phaseChart.resetZoom();
        }
        this.currentZoomRange = null;
      },

      updateZoomRange(range) {
        this.currentZoomRange = range;
      },

      handleZoomKeyDown(event) {
        // Only handle if this component is active/visible
        if (!this.$el || !this.$el.offsetParent) return;

        if (event.key === 'r' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this.resetZoom();
        }
      },
    },
  };
</script>

<style scoped>


.zoom-controls {
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
  color: #666;
}



.card-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chart-container {
  flex: 1;
  min-height: 0;
}

.chart-content {
  min-height: 360px;
  display: flex;
  flex-direction: column;
}

.loading-container {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.chart-skeleton {
  border-radius: 4px;
}
</style>
