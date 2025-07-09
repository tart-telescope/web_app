<template>
  <v-col cols="12" lg="12" md="12" sm="12">
    <v-card elevation="3" flat outlined>
      <v-card-title class="my-0 mx-0 pt-1 pb-0">
        <h4 class="teal--text text--lighten-2 text-uppercase">View Options</h4>
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" lg="12" md="12" sm="12">
            <v-select
              v-model="partition_size"
              dense
              :items="partition_sizes"
              label="Partition Size"
              outlined
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-col>
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
        <TreeshakenLineChart
          height="400"
          :options="apex.options"
          :series="
            series.slice(
              partition_size * partition,
              partition_size * (partition + 1),
            )
          "
          type="line"
        />
      </v-card-text>
    </v-card>
  </v-col>
</template>

<script>
  import { mapActions, mapState } from "pinia";

  import { useTheme } from "vuetify";
  import { useAppStore } from "@/stores/app";

  import TreeshakenLineChart from "./TreeshakenLineChart.vue";

  export default {
    name: "BaselineComponent",
    components: {
      TreeshakenLineChart,
    },
    setup() {
      const theme = useTheme();
      return { theme };
    },
    data() {
      return {
        partition_size: 6,
        partition_sizes: [4, 6, 24],
        ctheme: this.theme,
      };
    },
    computed: {
      ...mapState(useAppStore, ["channels"]),
      partitions() {
        return Array.from(
          {
            length: Math.ceil(this.channels.length / this.partition_size),
          },
          (_, i) => i,
        );
      },
      aMin() {
        return Math.min(
          ...this.series.flatMap((ant) => ant.data.map((el) => el.y)),
        );
      },
      aMax() {
        return Math.max(
          ...this.series.flatMap((ant) => ant.data.map((el) => el.y)),
        );
      },
      currentTheme() {
        return this.ctheme.name === "dark" ? "dark" : "light";
      },
      apex() {
        return {
          options: {
            grid: {
              theme: this.currentTheme,
              padding: {
                top: -20,
                right: 0,
                bottom: 0,
                left: 0,
              },
            },
            xaxis: {
              type: "numeric",
              labels: {
                formatter: function (value) {
                  return value.toFixed(1) + "MHz";
                },
              },
            },
            yaxis: {
              min: this.aMin || -80,
              max: this.aMax || -50,
            },
            colors: [
              "#1A73E8",
              "#B32824",
              "#F4B400",
              "#0F9D58",
              "#AB47BC",
              "#00ACC1",
              "#FF7043",
              "#9E9D24",
              "#3F51B5",
              "#FF4081",
            ],
            stroke: {
              curve: "smooth",
              width: 4,
              dashArray: [0, 8, 5, 4],
            },
            tooltip: {
              theme: "dark",
              style: {
                fontSize: "15px",
              },
              x: {
                show: false,
              },
              y: {
                formatter: function (value) {
                  return value.toFixed(1) + " dBm";
                },
              },
            },
            theme: {
              mode: this.currentTheme,
            },

            chart: {
              id: "vuechart",
              toolbar: {
                show: false,
              },
              animations: {
                enabled: false,
                easing: "easeinout",
                speed: 50,
                animateGradually: {
                  enabled: false,
                  delay: 50,
                },
                dynamicAnimation: {
                  enabled: false,
                  speed: 50,
                },
              },
            },
          },
        };
      },
      series() {
        var series = [];
        if (this.channels.length > 0) {
          series = this.channels.map((ch) => {
            return {
              name: "Ch" + ch.id.toString(),
              data: ch.freq.map((fi, xi) => {
                return {
                  x: fi,
                  y: ch.power[xi],
                };
              }),
              label: {
                text: "Ch" + ch.id.toString(),
              },
            };
          });
        }
        return series;
      },
    },
  };
</script>
