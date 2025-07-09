<template>
  <v-card
    v-if="ant_sel_i"
    class="mx-auto square-card"
    elevation="3"
    flat
    outlined
    raised
  >
    <div class="card-content">
      <v-card-title
        class="my-0 py-1 pr-0 teal--text text--lighten-2 text-uppercase"
      >
        Array Layout
      </v-card-title>
      <div class="svg-container">
        <svg id="overlaySVG" viewBox="0 0 512 512">
          <defs>
            <marker
              id="mid"
              markerHeight="20"
              markerWidth="10"
              orient="auto"
              refX="0.1"
              refY="5"
            >
              <path d="M0,0 V10 L5,5 Z" fill="#4db6ac" />
            </marker>
          </defs>
          <g class="grid">
            <circle
              v-for="ant_i in antennas"
              :key="ant_i.toString()"
              :cx="offset + scale * ant_i[0]"
              :cy="offset - scale * ant_i[1]"
              fill="white"
              r="12"
              stroke="rgb(0,0,0)"
              stroke-width="1"
            />
            <text
              dominant-baseline="middle"
              fill="teal"
              text-anchor="middle"
              :x="offset + scale * 0.5"
              :y="490"
            >
              1 metre
            </text>
            <path
              id="scaleLine"
              :d="scaleLine"
              fill="none"
              stroke="teal"
              stroke-width="2.5"
            />
            <path
              id="arrow-line"
              :d="line"
              fill="none"
              marker-mid="url(#mid)"
              stroke="teal"
              stroke-width="3"
            />

            <circle
              :cx="offset + scale * ant_sel_i[0]"
              :cy="offset - scale * ant_sel_i[1]"
              fill="white"
              :r="14"
              stroke="teal"
              style="stroke-width: 3"
            />
            <circle
              :cx="offset + scale * ant_sel_j[0]"
              :cy="offset - scale * ant_sel_j[1]"
              fill="white"
              :r="14"
              stroke="cyan"
              style="stroke-width: 3"
            />
            <text
              v-for="(ant_i, i) in antennas"
              :key="i.toString() + ant_i.toString()"
              dominant-baseline="middle"
              text-anchor="middle"
              :x="offset + scale * ant_i[0]"
              :y="1 + offset - scale * ant_i[1]"
            >
              {{ i }}
            </text>
          </g>
        </svg>
      </div>
    </div>
  </v-card>
</template>

<script>
  import { mapActions, mapState } from "pinia";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "ArrayLayout",
    props: {},
    data: function () {
      return {
        offset: 256,
      };
    },
    methods: {},
    computed: {
      line() {
        let x1 = Number.parseInt(this.offset + this.scale * this.ant_sel_i[0]);
        let y1 = Number.parseInt(this.offset - this.scale * this.ant_sel_i[1]);
        let x2 = Number.parseInt(this.offset + this.scale * this.ant_sel_j[0]);
        let y2 = Number.parseInt(this.offset - this.scale * this.ant_sel_j[1]);
        let xm = x1 + 0.5 * (x2 - x1).toString();
        let ym = y1 + 0.5 * (y2 - y1).toString();

        return ["M", x1, y1, "L", xm, ym, "L", x2, y2].join(" ");
      },
      scaleLine() {
        let x1 = Number.parseInt(this.offset + this.scale * 0);
        let y1 = Number.parseInt(500);
        let x2 = Number.parseInt(this.offset + this.scale * 1);
        let y2 = Number.parseInt(500);

        return ["M", x1, y1, "L", x2, y2].join(" ");
      },
      ...mapState(useAppStore, ["selectedBaseline", "antennas"]),

      ant_sel_i() {
        return this.antennas[this.selectedBaseline[0]];
      },
      ant_sel_j() {
        return this.antennas[this.selectedBaseline[1]];
      },
      scale() {
        const ant = this.antennas;
        let min = Math.min(...ant.map((a) => a[0]), ...ant.map((a) => a[1]));
        let max = Math.max(...ant.map((a) => a[0]), ...ant.map((a) => a[1]));
        let absMax = Math.max(-min, max);
        return Math.floor(220 / absMax);
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

.svg-container {
  flex: 1;
  position: relative;
  width: 100%;
  height: 100%;
}

#overlaySVG {
  width: 100%;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
}
</style>
