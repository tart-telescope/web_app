<template>
  <v-card class="mx-auto square-card" elevation="3" flat outlined>
    <div class="card-content">
      <v-card-title
        class="my-0 mx-0 pt-1 pb-0 teal--text text--lighten-2 text-uppercase"
      >
        Visibility Amplitude
      </v-card-title>
      <div class="chart-container">
        <TreeshakenLineChart
          :options="chartOptions"
          :series="amplitudeSeries"
          @mouse-leave="clearHoveredTimestamp"
          @mouse-move="handleChartHover"
        />
      </div>

      <v-card-title
        class="my-0 mx-0 pt-0 pb-0 teal--text text--lighten-2 text-uppercase"
      >
        Visibility Phase
      </v-card-title>
      <div class="chart-container">
        <TreeshakenLineChart
          :options="phaseChartOptions"
          :series="phaseSeries"
          @mouse-leave="clearHoveredTimestamp"
          @mouse-move="handleChartHover"
        />
      </div>

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
  import TreeshakenLineChart from "./TreeshakenLineChart.vue";

  export default {
    name: "BaselineComponent",
    components: { TreeshakenLineChart },

    data() {
      return {
        selected_baseline: [0, 23],
      };
    },

    computed: {
      ...mapState(useAppStore, ["vis_history"]),

      // Get filtered data once and reuse
      filteredData() {
        if (this.vis_history.length === 0) return [];

        const [i, j] = this.selected_baseline;
        return this.vis_history.map((x_h, idx) => {
          const item = x_h.data.find((x) => x.i === i && x.j === j);
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
            name: "Uncalibrated Amplitude",
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
            name: "Uncalibrated Phase",
            data: this.filteredData.map((d) => ({
              x: d.timestamp,
              y: d.phase?.toFixed(0) || null,
            })),
          },
        ];
      },

      chartOptions() {
        return {
          grid: {
            padding: { top: -20, right: 20, bottom: 10, left: 0 },
          },
          xaxis: {
            type: "datetime",
            labels: {
              datetimeFormatter: {
                hour: "HH:mm:ss",
                minute: "HH:mm:ss",
                second: "HH:mm:ss",
              },
            },
          },
          stroke: { curve: "smooth", width: 2 },
          markers: { size: 4, hover: { size: 8 } },
          tooltip: {
            theme: "dark",
            x: {
              formatter: (value) => {
                const date = new Date(value);
                return Number.isNaN(date.getTime())
                  ? value
                  : date.toLocaleTimeString("en-US", { hour12: false });
              },
            },
          },
        };
      },

      phaseChartOptions() {
        return {
          ...this.chartOptions,
          yaxis: { max: 180, min: -180 },
        };
      },
    },

    methods: {
      ...mapActions(useAppStore, [
        "selectBaseline",
        "setHoveredTimestamp",
        "clearHoveredTimestamp",
      ]),

      handleChartHover(event, chartContext) {
        if (this.filteredData.length === 0) return;

        const { clientX } = event;
        const chartEl = chartContext.el;
        const rect = chartEl.getBoundingClientRect();
        const ratio = (clientX - rect.left) / rect.width;
        const index = Math.round(ratio * (this.filteredData.length - 1));

        if (index >= 0 && index < this.filteredData.length) {
          this.setHoveredTimestamp(this.filteredData[index].timestamp);
        }
      },
    },
  };
</script>

<style scoped>
.square-card {
  aspect-ratio: 1;
  max-height: 80vh;
  max-width: 80vh;
  display: flex;
  flex-direction: column;
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
</style>
