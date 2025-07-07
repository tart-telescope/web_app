<template>
  <v-row>
    <v-col cols="12" lg="4" md="6" sm="12">
      <GeneralInfo />
    </v-col>
    <template v-if="telescope_mode == 'vis'">
      <v-col cols="12" lg="4" md="6" sm="12">
        <Synthesis />
      </v-col>
      <v-col cols="12" lg="4" md="6" sm="12">
        <Baseline />
      </v-col>
      <v-col cols="12" lg="4" md="6" sm="12">
        <ArrayLayout />
      </v-col>
      <v-col cols="12" lg="4" md="6" sm="12">
        <GainPhase />
      </v-col>
    </template>
    <RadioSpectrum v-if="telescope_mode == 'diag'" />
    <v-col cols="12" lg="4" md="6" sm="12">
      <S3Files :base-path="s3BasePath" />
    </v-col>
  </v-row>
</template>

<script>
  import { mapState } from "pinia";
  import ArrayLayout from "@/components/ArrayLayout.vue";
  import Baseline from "@/components/Baseline.vue";
  import GainPhase from "@/components/GainPhase.vue";
  import GeneralInfo from "@/components/GeneralInfo.vue";

  import RadioSpectrum from "@/components/RadioSpectrum.vue";
  import S3Files from "@/components/S3Files.vue";

  import Synthesis from "@/components/Synthesis.vue";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "Home",
    components: {
      Synthesis,
      Baseline,
      ArrayLayout,
      GeneralInfo,
      RadioSpectrum,
      S3Files,
      GainPhase,
    },
    computed: {
      ...mapState(useAppStore, ["telescope_mode"]),
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
        console.log("Home.vue computed s3BasePath:", path);
        console.log("  - telescopeName:", this.telescopeName);
        console.log("  - fallback telescope:", telescope);
        console.log("  - current date:", now.toDateString());
        return path;
      },
    },
  };
</script>
