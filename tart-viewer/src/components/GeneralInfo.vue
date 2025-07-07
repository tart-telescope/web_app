<template>
  <v-card class="mx-auto" elevation="3">
    <v-card-title
      class="py-3 teal--text text--lighten-2 cursor-pointer"
      @click="show = !show"
    >
      <div class="d-flex justify-space-between align-center w-100">
        <div class="d-flex align-center">
          <v-icon
            class="mr-2"
            color="teal lighten-2"
          >mdi-radio-telescope</v-icon>
          <div>
            <span class="text-h6">{{
              info.name || "Telescope Information"
            }}</span>
            <div
              v-if="info.location"
              class="text-caption text--secondary d-flex align-center"
            >
              <v-icon class="mr-1" color="grey" size="12">mdi-map-marker</v-icon>
              {{ formatLocation(info.location) }}
            </div>
          </div>
        </div>
        <v-btn icon size="small">
          <v-icon>{{ show ? "mdi-chevron-up" : "mdi-chevron-down" }}</v-icon>
        </v-btn>
      </div>
    </v-card-title>

    <v-expand-transition>
      <v-card-text v-show="show" class="pa-4">
        <!-- Info Grid -->
        <v-row dense>
          <v-col
            v-for="(value, key) in prioritizedInfo"
            :key="key"
            cols="12"
            lg="4"
            md="6"
            sm="12"
          >
            <div class="d-flex align-center pa-2">
              <v-icon class="mr-3" :color="getIconColor(key)" size="20">
                {{ getIcon(key) }}
              </v-icon>
              <div class="flex-grow-1">
                <div class="text-caption text--secondary">
                  {{ formatKey(key) }}
                </div>
                <div class="text-body-2 font-weight-medium">
                  {{ formatValue(value, key) }}
                </div>
              </div>
            </div>
          </v-col>
        </v-row>
        <RecentData />
      </v-card-text>
    </v-expand-transition>
  </v-card>
</template>

<script>
  import { mapState } from "pinia";
  import RecentData from "@/components/RecentData.vue";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "GeneralInfo",
    components: {
      RecentData,
    },
    data() {
      return {
        show: false,
      };
    },
    computed: {
      ...mapState(useAppStore, ["info"]),

      prioritizedInfo() {
        // Filter out special cases and prioritize important info
        const filtered = { ...this.info };
        delete filtered.name;
        delete filtered.location;

        // Prioritize order: important info first
        const priority = [
          "num_antenna",
          "sampling_frequency",
          "bandwidth",
          "version",
          "mode",
        ];
        const prioritized = {};

        // Add prioritized items first
        for (const key of priority) {
          if (filtered[key] !== undefined) {
            prioritized[key] = filtered[key];
            delete filtered[key];
          }
        }

        // Add remaining items
        Object.assign(prioritized, filtered);

        return prioritized;
      },
    },
    methods: {
      formatKey(key) {
        return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      },

      formatValue(value, key) {
        if (key === "location" && typeof value === "object") {
          return this.formatLocation(value);
        }
        if (typeof value === "number") {
          if (
            key.includes("freq") ||
            key.includes("rate") ||
            key.includes("bandwidth")
          ) {
            return (value / 1e6).toFixed(3) + " MHz";
          }
          if (key.includes("time") || key.includes("timestamp")) {
            return new Date(value * 1000).toLocaleString();
          }
          return value.toLocaleString();
        }
        return value;
      },

      formatLocation(location) {
        if (typeof location === "object" && location.lat && location.lon) {
          return `${location.lat.toFixed(3)}°, ${location.lon.toFixed(3)}°`;
        }
        return location;
      },

      getIcon(key) {
        const iconMap = {
          version: "mdi-tag",
          sampling_frequency: "mdi-sine-wave",
          bandwidth: "mdi-wifi",
          num_antenna: "mdi-radio-tower",
          antenna: "mdi-radio-tower",
          frequency: "mdi-waveform",
          timestamp: "mdi-clock",
          time: "mdi-clock",
          mode: "mdi-cog",
          status: "mdi-circle",
          default: "mdi-information",
        };

        for (const [pattern, icon] of Object.entries(iconMap)) {
          if (key.toLowerCase().includes(pattern)) {
            return icon;
          }
        }
        return iconMap.default;
      },

      getIconColor(key) {
        if (key.includes("freq") || key.includes("bandwidth")) return "purple";
        if (key.includes("antenna")) return "orange";
        if (key.includes("time") || key.includes("timestamp")) return "green";
        if (key.includes("version") || key.includes("mode")) return "indigo";
        return "grey darken-1";
      },
    },
  };
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}

.h-100 {
  height: 100%;
}

.w-100 {
  width: 100%;
}
</style>
