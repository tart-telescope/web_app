<template>
  <v-card class="mx-auto" elevation="3">
    <v-card-title class="my-0 py-2 teal--text text--lighten-2 text-uppercase">
      Antenna Gains & Phases
    </v-card-title>

    <v-card-text v-if="gain && gain.gain && gain.phase_offset" class="pa-2">
      <v-row dense>
        <v-col
          v-for="(gainValue, index) in gain.gain"
          :key="`combined-${index}`"
          class="pa-1"
          cols="2"
        >
          <v-card class="combined-tile" elevation="1">
            <!-- Antenna number badge -->
            <div class="antenna-badge">
              {{ index }}
            </div>
            <!-- Mag/Phase labels for first antenna -->
            <div v-if="index === 0" class="amp-label">Mag</div>
            <div v-if="index === 0" class="phase-label">Pha</div>
            <!-- Gain (top half) -->
            <div
              class="gain-section text-center pa-1"
              :style="{ backgroundColor: getGainColorHex(gainValue) }"
            >
              <div class="body-2 white--text">{{ roundValue(gainValue) }}</div>
            </div>
            <!-- Phase (bottom half) -->
            <div
              class="phase-section text-center pa-1"
              :style="{
                backgroundColor: getPhaseColorHex(gain.phase_offset[index]),
              }"
            >
              <div class="body-2 white--text">
                {{ roundValue(normalizePhase(gain.phase_offset[index])) }}
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>

    <v-card-text v-else class="text-center text--secondary">
      No gain/phase data available
    </v-card-text>
  </v-card>
</template>

<script>
  import { mapState } from "pinia";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "GainPhaseComponent",

    computed: {
      ...mapState(useAppStore, ["gain"]),
    },

    methods: {
      roundValue(value) {
        if (typeof value !== "number") return "N/A";
        return Math.round(value * 100) / 100;
      },

      normalizePhase(phaseValue) {
        if (typeof phaseValue !== "number") return phaseValue;
        // Normalize to [-π, π] range
        let normalized = phaseValue % (2 * Math.PI);
        if (normalized > Math.PI) {
          normalized -= 2 * Math.PI;
        } else if (normalized < -Math.PI) {
          normalized += 2 * Math.PI;
        }
        return normalized;
      },

      getGainColor(gainValue) {
        if (typeof gainValue !== "number") return "grey";

        // Color code gains based on fractional distance from ideal value of 1.0
        const ratio = Math.max(gainValue / 1, 1 / gainValue);
        if (ratio > 3) return "red darken-2";
        if (ratio > 2) return "orange darken-2";
        return "green darken-2";
      },

      getGainColorHex(gainValue) {
        if (typeof gainValue !== "number") return "#757575";

        // Color code gains based on fractional distance from ideal value of 1.0
        const ratio = Math.max(gainValue / 1, 1 / gainValue);
        if (ratio > 3) return "#c62828";
        if (ratio > 2) return "#ef6c00";
        return "#2e7d32";
      },

      getPhaseColor(phaseValue) {
        if (typeof phaseValue !== "number") return "grey";

        // Color code phases based on value range
        const normalizedPhase = Math.abs(phaseValue) % (2 * Math.PI);
        if (normalizedPhase < Math.PI / 3) return "blue darken-2";
        if (normalizedPhase < (2 * Math.PI) / 3) return "purple darken-2";
        if (normalizedPhase < Math.PI) return "indigo darken-2";
        if (normalizedPhase < (4 * Math.PI) / 3) return "cyan darken-2";
        if (normalizedPhase < (5 * Math.PI) / 3) return "teal darken-2";
        return "blue-grey darken-2";
      },

      getPhaseColorHex(phaseValue) {
        if (typeof phaseValue !== "number") return "#757575";

        // Color code phases based on value range
        const normalizedPhase = Math.abs(this.normalizePhase(phaseValue));
        if (normalizedPhase < Math.PI / 3) return "#1565c0";
        if (normalizedPhase < (2 * Math.PI) / 3) return "#6a1b9a";
        if (normalizedPhase < Math.PI) return "#283593";
        if (normalizedPhase < (4 * Math.PI) / 3) return "#00838f";
        if (normalizedPhase < (5 * Math.PI) / 3) return "#00695c";
        return "#37474f";
      },
    },
  };
</script>

<style scoped>
.combined-tile {
  min-height: 80px;
  overflow: hidden;
  aspect-ratio: 1;
  width: 100%;
  position: relative;
}

.antenna-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  background-color: black;
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 3px;
  z-index: 10;
  min-width: 16px;
  text-align: center;
}

.amp-label {
  position: absolute;
  top: 2px;
  right: 2px;
  background-color: black;
  color: white;
  font-size: 9px;
  font-weight: bold;
  padding: 1px 3px;
  border-radius: 2px;
  z-index: 10;
}

.phase-label {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background-color: black;
  color: white;
  font-size: 9px;
  font-weight: bold;
  padding: 1px 3px;
  border-radius: 2px;
  z-index: 10;
}

.gain-section {
  height: 50%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.phase-section {
  height: 50%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.caption {
  font-size: 9px !important;
  line-height: 1;
}

.body-2 {
  font-size: 11px !important;
  line-height: 1.1;
}
</style>
