<template>
  <v-row>
    <v-col cols="12" lg="4" md="6" sm="12">
      <GeneralInfo />
    </v-col>

    <template v-if="telescope_mode == 'vis'">
      <v-col cols="12" lg="4" md="6" sm="12">
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
        <Synthesis v-else :key="`synthesis-${TART_URL}-${localMode}-${synthesisUpdateTrigger}`" ref="synthesis" />
      </v-col>
      <v-col cols="12" lg="4" md="6" sm="12">
        <ArrayLayout />
      </v-col>
      <v-col cols="12" lg="4" md="6" sm="12">
        <Baseline />
      </v-col>
      <v-col cols="12" lg="4" md="6" sm="12">
        <GainPhase />
      </v-col>
    </template>
    <RadioSpectrum v-if="telescope_mode == 'diag'" />
    <v-col cols="12" lg="4" md="6" sm="12">
      <RecentData />
    </v-col>
    <v-col cols="12">
      <FpgaStatus />
    </v-col>
    <v-col cols="12">
      <S3Files :base-path="s3BasePath" :data-thinning="dataThinning" />
    </v-col>
  </v-row>
</template>

<script>
  import { mapState } from "pinia";
  import ArrayLayout from "@/components/ArrayLayout.vue";
  import Baseline from "@/components/Baseline.vue";
  import FpgaStatus from "@/components/FpgaStatus.vue";
  import GainPhase from "@/components/GainPhase.vue";
  import GeneralInfo from "@/components/GeneralInfo.vue";
  import RadioSpectrum from "@/components/RadioSpectrum.vue";
  import RecentData from "@/components/RecentData.vue";
  import S3Files from "@/components/S3Files.vue";
  import Synthesis from "@/components/Synthesis.vue";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "Home",
    data() {
      return {
        synthesisUpdateTrigger: 0,
      };
    },
    components: {
      ArrayLayout,
      Baseline,
      FpgaStatus,
      GainPhase,
      GeneralInfo,
      RadioSpectrum,
      RecentData,
      S3Files,
      Synthesis,
    },
    computed: {
      ...mapState(useAppStore, ["telescope_mode", "dataThinning", "TART_URL", "localMode", "vis", "gain", "antennas"]),
      telescopeName() {
        return useAppStore().telescopeName;
      },
      s3BasePath() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // JS months are 0-based
        const day = now.getDate();

        // Use fallback if telescopeName is undefined
        const telescope = this.telescopeName || "zm-cbu";
        const path = `${telescope}/vis/${year}/${month}/${day}/`;
        return path;
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
    methods: {
      triggerSynthesisUpdate() {
        this.synthesisUpdateTrigger++;
      },
    },
    mounted() {
      // Component is now ready for direct method calls via ref
    },
  };
</script>
