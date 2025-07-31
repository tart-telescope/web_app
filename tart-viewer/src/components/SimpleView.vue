<template>
  <v-container fluid>
    <v-row justify="center">
      <v-col cols="12">
        <div class="text-center mb-4">
          <h1 class="text-h4 text-primary">{{ telescopeName }}</h1>
        </div>
      </v-col>
      <v-col cols="12">
        <v-card v-if="!isSynthesisDataReady" class="d-flex align-center justify-center" min-height="400">
          <div class="text-center">
            <v-progress-circular
              class="mb-4"
              color="primary"
              indeterminate
              size="48"
            />
            <div class="text-h6 text-grey">Loading synthesis data...</div>
          </div>
        </v-card>
        <Synthesis v-else :key="`synthesis-${TART_URL}-${localMode}`" :show-title="false" />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import { mapActions, mapState } from "pinia";
  import Synthesis from "@/components/Synthesis.vue";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "SimpleView",
    components: {
      Synthesis,
    },
    data() {
      return {
        originalNside: null,
      };
    },
    computed: {
      ...mapState(useAppStore, ["TART_URL", "localMode", "vis", "gain", "antennas", "nside", "info"]),
      telescopeName() {
        return this.info?.name || useAppStore().telescopeName || 'TART';
      },
      isSynthesisDataReady() {
        // Check if all required synthesis data is available
        return !!(
          this.antennas &&
          this.antennas.length > 0 &&
          this.gain &&
          this.vis
        );
      },
    },
    mounted() {
      // Store original nside and set to 94 for simple view
      this.originalNside = this.nside;
      this.setNside(94);
    },
    beforeUnmount() {
      // Restore original nside when leaving simple view
      if (this.originalNside !== null) {
        this.setNside(this.originalNside);
      }
    },
    methods: {
      ...mapActions(useAppStore, ["setNside"]),
    },
  };
</script>

<style scoped>
/* Add any simple view specific styles here */
</style>
