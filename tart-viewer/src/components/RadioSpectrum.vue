<template>

  <v-col
    v-for="(partition, index) in partitions"
    :key="index"
    cols="12"
    :lg="partition_size == 24 ? 12 : 6"
    :md="partition_size == 24 ? 12 : 6"
    sm="12"
  >
    <v-card elevation="3" flat outlined>
      <v-card-title class="my-0 mx-0 pt-1 pb-0">
        <h4 class="teal--text text--lighten-2 text-uppercase">
          Baseband Spectrum
        </h4>
      </v-card-title>
      <v-card-text>
        <UPlotChart
          :key="`chart-${partition}-${partition_size}`"
          :height="400"
          :series="partitionedSeries[partition]"
          :sync-key="`spectrum-${partition}-${partition_size}`"
          timezone="UTC"
          :show-legend="true"
          :time-axis="false"
          y-axis-label="Power (dBm)"
          x-axis-label="Frequency (MHz)"
          :show-cursor="true"
          :emit-events="false"
          :cursor-focus="true"
        />
      </v-card-text>
    </v-card>
  </v-col>
</template>

<script>
  import { mapActions, mapState } from "pinia";

  import { useTheme } from "vuetify";
  import { useAppStore } from "@/stores/app";

  import UPlotChart from "./UPlotChart.vue";

  export default {
    name: "BaselineComponent",
    components: {
      UPlotChart,
    },
    setup() {
      const theme = useTheme();
      return { theme };
    },
    data() {
      return {};
    },
    computed: {
      ...mapState(useAppStore, ["channels", "partition_size"]),
      
      partitionsCount() {
        return this.partition_size >= 24 ? 1 : Math.ceil(this.channels.length / this.partition_size);
      },
      
      partitions() {
        return Array.from({ length: this.partitionsCount }, (_, i) => i);
      },
      
      series() {
        if (!this.channels.length) return [];
        
        return this.channels.map((ch) => ({
          name: `Ch${ch.id}`,
          data: ch.freq.map((fi, xi) => ({ x: fi, y: ch.power[xi] }))
        }));
      },
      
      partitionedSeries() {
        if (this.partition_size >= 24) return [this.series];
        
        const partitioned = [];
        for (let i = 0; i < this.partitionsCount; i++) {
          const start = i * this.partition_size;
          partitioned.push(this.series.slice(start, start + this.partition_size));
        }
        return partitioned;
      },
    },

  };
</script>


