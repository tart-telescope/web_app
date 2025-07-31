<template>
  <v-card class="mx-auto" elevation="3">
    <div class="card-content">
      <!-- Chart content area with consistent height -->
      <div class="chart-content">
        <!-- Show skeleton loader when insufficient data -->
        <div v-if="filteredData.length === 0" class="loading-container">
          <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
            <v-icon class="mr-2">mdi-chart-line</v-icon>
            Visibility Amplitude
          </v-card-title>
          <div class="chart-container">
            <v-skeleton-loader
              class="chart-skeleton"
              height="150"
              type="image"
            />
          </div>

          <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
            <v-icon class="mr-2">mdi-chart-timeline-variant</v-icon>
            Visibility Phase
          </v-card-title>
          <div class="chart-container">
            <v-skeleton-loader
              class="chart-skeleton"
              height="150"
              type="image"
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
              class="mr-2"
              color="primary"
              size="small"
              variant="outlined"
            >
              New Data
            </v-chip>
            <v-btn size="small" @click="resetZoom">Reset Zoom</v-btn>
          </v-card-title>
          <div class="chart-container">
            <UPlotChart
              ref="amplitudeChart"
              :height="150"
              :reset-zoom-on-data-change="telescopeChanged"
              :series="amplitudeSeries"
              sync-key="baseline-charts"
              timezone="UTC"
              @mouse-leave="clearHoveredTimestamp"
              @mouse-move="handleUPlotHover"
              @zoom-changed="updateZoomRange"
            />
          </div>

          <div class="chart-container">
            <UPlotChart
              ref="phaseChart"
              :height="150"
              :reset-zoom-on-data-change="telescopeChanged"
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

          <!-- Tooltip showing local and UTC times -->
          <div v-if="hoveredData" class="hover-tooltip" :style="tooltipStyle">
            <div class="tooltip-time"><strong>Local:</strong> {{ hoveredData.localTime }}</div>
            <div class="tooltip-time"><strong>UTC:</strong> {{ hoveredData.utcTime }}</div>
            <div class="tooltip-data">Amplitude: {{ hoveredData.amplitude }}</div>
            <div class="tooltip-data">Phase: {{ hoveredData.phase }}</div>
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
        telescopeChanged: false,
        hoveredData: null,
        tooltipStyle: {},
      };
    },

    computed: {
      ...mapState(useAppStore, ["vis_history", "info"]),

      // Get filtered data once and reuse
      filteredData() {
        if (this.vis_history.length === 0) return [];

        const [i, j] = this.selected_baseline;
        const result = this.vis_history.map((x_h, idx) => {
          const item = x_h.data ? x_h.data.find((x) => x.i === i && x.j === j) : null;

          // Debug: log first few raw timestamps
          if (idx < 3) {
            console.log(`Raw vis_history ${idx}:`, {
              timestamp: x_h.timestamp,
              timestampType: typeof x_h.timestamp,
              date: new Date(x_h.timestamp).toISOString(),
              hasData: !!x_h.data,
              item: item
            });
          }

          return {
            timestamp: x_h.timestamp,
            amplitude: item ? Math.hypot(item.re, item.im) : null,
            phase: item ? (Math.atan2(item.im, item.re) * 180) / Math.PI : null,
          };
        });

        return result;
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

    watch: {
      'info.name': {
        handler(newName, oldName) {
          if (oldName && newName && newName !== oldName) {
            this.telescopeChanged = true;
            this.$nextTick(() => {
              this.telescopeChanged = false;
            });
          }
        },
        immediate: false,
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
            // Debug: log first few data points to check timestamp format
            if (event.idx < 3) {
              console.log(`Filtered data ${event.idx}:`, {
                timestamp: data.timestamp,
                date: new Date(data.timestamp).toISOString(),
                amplitude: data.amplitude,
                phase: data.phase
              });
            }

            // Set hovered timestamp for other components
            this.setHoveredTimestamp(data.timestamp);

            // Create tooltip with both local and UTC times
            const date = new Date(data.timestamp);
            const localTime = date.toLocaleString(undefined, { hour12: false });
            const utcTime = date.toISOString().replace('T', ' ').replace('Z', ' UTC');

            this.hoveredData = {
              localTime: localTime,
              utcTime: utcTime,
              amplitude: data.amplitude?.toFixed(3) || 'N/A',
              phase: data.phase?.toFixed(1) + '°' || 'N/A'
            };

            // Position tooltip near cursor
            this.tooltipStyle = {
              position: 'absolute',
              left: (event.left + 5) + 'px',
              top: (event.top - 10) + 'px',
              zIndex: 1000,
              pointerEvents: 'none'
            };
          }
        }
      },

      clearHoveredTimestamp() {
        this.setHoveredTimestamp(null);
        this.hoveredData = null;
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

.hover-tooltip {
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-width: 180px;
}

.tooltip-time {
  margin-bottom: 4px;
  font-family: monospace;
  font-size: 11px;
}

.tooltip-data {
  margin-top: 2px;
  color: #e0e0e0;
}
</style>
