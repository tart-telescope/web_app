<template>
  <v-alert
    v-if="telescope_mode != 'vis'"
    dense
    outlined
    prominent
    type="warning"
  >
    <div class="title">Operating Mode: {{ telescope_mode }}</div>
    <div>
      Visibilities most likely outdated because the telescope is currently not
      operating in visibility mode.
    </div>
  </v-alert>

  <v-card class="mx-auto square-card" elevation="3">
    <div class="card-content">
      <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
        <v-icon class="mr-2">mdi-eye</v-icon>
        Realtime View
        <v-spacer />
        <v-btn
          :color="show_sat ? 'primary' : 'default'"
          icon
          size="small"
          @click="show_sat = !show_sat"
        >
          <v-icon>mdi-satellite-variant</v-icon>
        </v-btn>
        <v-btn
          :color="is3D ? 'primary' : 'default'"
          icon
          size="small"
          @click="is3D = !is3D"
        >
          <v-icon>mdi-rotate-3d-variant</v-icon>
        </v-btn>
        <v-btn
          icon
          size="small"
          @click="fullscreen = true"
        >
          <v-icon>mdi-fullscreen</v-icon>
        </v-btn>
      </v-card-title>

      <div class="svg-container">
        <SvgThreejs v-if="!is3D" ref="svgRef" :auto-resize="true" />
        <Threejs3D v-else ref="threejsRef" :auto-resize="true" />
      </div>



      <v-card class="py-0 my-0" elevation="0">

        <!-- Timing Info Display -->
        <div v-if="showTimings" class="pa-3 text-lowercase">
          <v-row>
            <v-col class="text-right">pl{{ timings.payload }} ms</v-col>
            <v-col class="text-right">wasm {{ timings.render }} ms</v-col>
            <v-col class="text-right">gl {{ timings.setting }} ms</v-col>
            <v-col class="text-right">
              <v-switch
                v-model="use_simd"
                class="ma-0 pa-0"
                dense
                hide-details
                inset
                label="SIMD"
              />
            </v-col>
          </v-row>
        </div>
      </v-card>
    </div>
  </v-card>

  <!-- Fullscreen Overlay -->
  <v-overlay v-model="fullscreen" class="fullscreen-overlay" persistent>
    <div class="fullscreen-container">
      <div class="close-controls">
        <span class="esc-text">Press ESC to close</span>
        <v-btn
          class="close-btn"
          color="white"
          icon
          size="large"
          @click="fullscreen = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>

      <div class="fullscreen-threejs">
        <Threejs3D
          v-if="fullscreen"
          ref="fullscreenThreejsRef"
          :auto-resize="true"
        />
      </div>
    </div>
  </v-overlay>
</template>

<script>
  import {
    get_color_bytes_only,
    get_color_bytes_only_simd,
    get_hemisphere_pixel_corners,
    get_pixel_coords_only_simd,
  } from "gridless";
  import { mapState } from "pinia";
  import { useAppStore } from "@/stores/app";
  import SvgThreejs from "./SvgThreejs.vue";
  import Threejs3D from "./Threejs3D.vue";

  // Constants
  const ANTENNA_INDICES = Array.from({ length: 24 }, (_, i) => i);

  // Cache for expensive computations
  let polygonCache = null;
  let sphereCache = null;
  let lastNside = null;
  let lastIs3D = null;
  let antennaSetCache = new Set();
  let lastFilteredVis = null;

  export default {
    name: "SynthesisComponent",
    components: { SvgThreejs, Threejs3D },

    data() {
      return {
        ANTENNA_INDICES,
        timings: { payload: 0, render: 0, setting: 0 },
        use_simd: true,
        show_sat: true,
        srcLoc: { elevation: 0, azimuth: 0, name: "" },
        isInitialized: false,
        is3D: true,
        fullscreen: false,
      };
    },

    computed: {
      ...mapState(useAppStore, [
        "info",
        "vis",
        "gain",
        "antennas",
        "sat_list",
        "telescope_mode",
        "vis_history",
        "hoveredTimestamp",
        "showTimings",
        "nside",
        "antennasUsed",
      ]),

      currentVisData() {
        if (!this.hoveredTimestamp || this.vis_history.length === 0) {
          return this.vis;
        }

        return (
          this.vis_history.find(
            (v) => v.timestamp.toString() === this.hoveredTimestamp.toString(),
          ) || this.vis
        );
      },

      currentTimestamp() {
        return this.currentVisData?.timestamp;
      },

      currentSatelliteData() {
        if (!this.hoveredTimestamp || this.vis_history.length === 0) {
          return this.sat_list;
        }

        const historicalVis = this.vis_history.find(
          (v) => v.timestamp.toString() === this.hoveredTimestamp.toString(),
        );

        return historicalVis && historicalVis.satellites
          ? historicalVis.satellites
          : this.sat_list;
      },

      formattedTimestamp() {
        if (!this.currentTimestamp) return "";
        return new Date(this.currentTimestamp).toLocaleString("en-US", {
          hour12: false,
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      },

      // Optimized antenna set using Set for O(1) lookup
      antennaSet() {
        const newSet = new Set(this.antennasUsed);
        if (
          newSet.size !== antennaSetCache.size ||
          ![...newSet].every((x) => antennaSetCache.has(x))
        ) {
          antennaSetCache = newSet;
        }
        return antennaSetCache;
      },

      filteredVisData() {
        if (!this.currentVisData?.data) return null;

        if (this.antennasUsed.length == 24) return this.currentVisData.data;

        const filtered = this.currentVisData.data.filter(
          (v) => this.antennaSet.has(v.i) && this.antennaSet.has(v.j),
        );

        return filtered;
      },

      // Pre-computed payload for rendering
      renderPayload() {
        if (!this.isReadyToRender) return null;

        return {
          info: { info: this.info },
          ant_pos: this.antennas,
          gains: this.gain,
          data: [
            [
              {
                data: this.filteredVisData,
                timestamp: this.currentVisData.timestamp,
              },
              [],
            ],
          ],
        };
      },

      isReadyToRender() {
        const ready =
          this.antennas &&
          this.antennas.length > 0 &&
          this.gain &&
          this.filteredVisData &&
          this.filteredVisData.length > 0 &&
          this.isInitialized;
        return !!ready;
      },
    },

    watch: {
      // Single watcher for all data that should trigger a full update
      isReadyToRender: {
        handler(newVal) {
          if (newVal) {
            this.$nextTick(() => {
              this.doFullUpdate();
            });
          }
        },
        // immediate: true,
      },

      // Geometry changes (nside or 2D/3D mode)
      nside() {
        this.doFullUpdate();
      },

      is3D() {
        this.$nextTick(() => {
          this.doFullUpdate();
          // Handle resize when switching between 2D/3D modes
          this.handleResize();
        });
      },

      fullscreen() {
        if (this.fullscreen) {
          this.$nextTick(() => {
            // Update fullscreen component when it becomes visible
            this.updateFullscreenComponent();
          });
        }
      },

      // Satellite overlay changes
      show_sat() {
        this.updateSatelliteOverlays();
      },

      currentSatelliteData() {
        this.updateSatelliteOverlays();
      },

      hoveredTimestamp() {
        this.updateSatelliteOverlays();
      },

      // Data changes that need color updates
      currentVisData() {
        if (this.isReadyToRender) {
          this.doColorUpdate();
        }
      },
    },
    created() {
      this.updateGeometry();
    },

    mounted() {
      this.isInitialized = true;
      this.$nextTick(() => {
        this.updateGeometry();
        this.doColorUpdate();
        // Ensure proper resize after mount
        this.handleResize();
      });

      // Add ESC key listener for fullscreen overlay
      document.addEventListener("keydown", this.handleKeyDown);
      
      // Add resize listener
      window.addEventListener("resize", this.handleResize);
    },

    beforeUnmount() {
      polygonCache = null;
      sphereCache = null;
      lastFilteredVis = null;
      antennaSetCache.clear();

      // Remove event listeners
      document.removeEventListener("keydown", this.handleKeyDown);
      window.removeEventListener("resize", this.handleResize);
    },

    methods: {
      // Single method that does a complete update (geometry + colors + overlays)
      doFullUpdate() {
        console.log("doFullUpdate called");
        this.updateGeometry();
        this.doColorUpdate();
        this.updateSatelliteOverlays();
      },

      // Just update colors (fast)
      doColorUpdate() {
        if (!this.renderPayload) {
          return;
        }
        if (!sphereCache && this.$refs.threejsRef && this.$refs.threejsRef.createSphereFromCorners) {
          sphereCache = get_hemisphere_pixel_corners(this.nside);
          this.$refs.threejsRef.createSphereFromCorners(sphereCache);
        }

        let start = performance.now();
        const payload = JSON.stringify(this.renderPayload);
        this.timings.payload = (performance.now() - start).toFixed(1);
        start = performance.now();

        const currentRef = this.is3D ? this.$refs.threejsRef : this.$refs.svgRef;
        if (!currentRef || this.nside < 2) return;

        const bytes = this.use_simd
          ? get_color_bytes_only_simd(payload, this.nside)
          : get_color_bytes_only(payload, this.nside);
        this.timings.render = (performance.now() - start).toFixed(1);
        start = performance.now();

        // Ensure rendering component is ready before painting pixels
        this.$nextTick(() => {
          if (this.is3D && this.$refs.threejsRef && this.$refs.threejsRef.updateSphereColors) {
            this.$refs.threejsRef.updateSphereColors(bytes);

            // Also update fullscreen component if active
            if (this.fullscreen && this.$refs.fullscreenThreejsRef && this.$refs.fullscreenThreejsRef.updateSphereColors) {
              this.$refs.fullscreenThreejsRef.updateSphereColors(bytes);
            }
          } else if (!this.is3D && this.$refs.svgRef && this.$refs.svgRef.updatePolygonColors) {
            this.$refs.svgRef.updatePolygonColors(bytes);
          }
          this.timings.setting = (performance.now() - start).toFixed(1);
        });
      },

      updateGeometry() {
        if (this.nside < 2) return;

        const modeChanged = lastIs3D !== this.is3D;
        const nsideChanged = lastNside !== this.nside;

        if (nsideChanged || modeChanged) {
          let start = performance.now();

          if (this.is3D) {
            if (nsideChanged || !sphereCache) {
              sphereCache = get_hemisphere_pixel_corners(this.nside);
            }
            this.timings.render = (performance.now() - start).toFixed(1);
            start = performance.now();
            if (this.$refs.threejsRef && this.$refs.threejsRef.createSphereFromCorners) {
              this.$refs.threejsRef.createSphereFromCorners(sphereCache);
            }
          } else {
            if (nsideChanged || !polygonCache) {
              polygonCache = get_pixel_coords_only_simd(this.nside);
            }
            this.timings.render = (performance.now() - start).toFixed(1);
            start = performance.now();

            if (this.$refs.svgRef) {
              this.$refs.svgRef.createPolygonCoordinates(polygonCache);
            }
          }

          this.timings.setting = (performance.now() - start).toFixed(1);
          lastNside = this.nside;
          lastIs3D = this.is3D;
        }
      },

      updateSatelliteOverlays() {
        if (this.is3D && this.$refs.threejsRef) {
          this.$refs.threejsRef.updateSatelliteOverlays(
            this.currentSatelliteData,
            this.show_sat,
          );
        }

        // Also update fullscreen component if it exists
        if (this.fullscreen && this.$refs.fullscreenThreejsRef) {
          this.$refs.fullscreenThreejsRef.updateSatelliteOverlays(
            this.currentSatelliteData,
            this.show_sat,
          );
        }
      },

      updateFullscreenComponent() {
        if (
          this.fullscreen &&
          this.$refs.fullscreenThreejsRef &&
          this.isReadyToRender
        ) {
          // Update geometry
          if (sphereCache) {
            this.$refs.fullscreenThreejsRef.createSphereFromCorners(sphereCache);
          }

          // Update colors
          const payload = JSON.stringify(this.renderPayload);
          const bytes = this.use_simd
            ? get_color_bytes_only_simd(payload, this.nside)
            : get_color_bytes_only(payload, this.nside);
          this.$refs.fullscreenThreejsRef.updateSphereColors(bytes);

          // Update satellites
          this.$refs.fullscreenThreejsRef.updateSatelliteOverlays(
            this.currentSatelliteData,
            this.show_sat,
          );
        }
      },

      handleKeyDown(event) {
        // Close fullscreen overlay on ESC key
        if (event.key === "Escape" && this.fullscreen) {
          this.fullscreen = false;
        }
      },

      handleResize() {
        // Trigger resize on both 2D and 3D components
        this.$nextTick(() => {
          if (this.is3D && this.$refs.threejsRef && this.$refs.threejsRef.handleResize) {
            this.$refs.threejsRef.handleResize();
          } else if (!this.is3D && this.$refs.svgRef && this.$refs.svgRef.handleResize) {
            this.$refs.svgRef.handleResize();
          }
          
          // Also handle fullscreen component
          if (this.fullscreen && this.$refs.fullscreenThreejsRef && this.$refs.fullscreenThreejsRef.handleResize) {
            this.$refs.fullscreenThreejsRef.handleResize();
          }
        });
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
  width: 100%;
  min-height: 200px;
  position: relative;
  flex: 1;
}

.fullscreen-overlay {
  z-index: 9999;
}

.fullscreen-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: black;
}

.close-controls {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 12px;
}

.esc-text {
  color: white;
  font-size: 14px;
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.close-btn {
  flex-shrink: 0;
}

.fullscreen-threejs {
  width: 100%;
  height: 100%;
}
</style>
