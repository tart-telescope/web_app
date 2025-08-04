<template>
  <div class="simple-view-container">
    <div v-if="!isSynthesisDataReady" class="loading-container">
      <div class="text-center">
        <v-progress-circular
          class="mb-4"
          color="primary"
          indeterminate
          size="48"
        />
        <div class="text-h6 text-grey">Loading synthesis data...</div>
      </div>
    </div>
    <Synthesis v-else :key="`synthesis-${TART_URL}-${localMode}`" :show-title="false" :simple-view="true" />
  </div>
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
.simple-view-container {
  width: 100vw;
  height: 100vh;
  padding: 0;
  margin: 0;
  overflow: hidden;
}

.loading-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
