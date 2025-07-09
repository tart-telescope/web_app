<template>
  <v-list-item>
    <v-select
      v-model="telescope_mode"
      class="mt-2"
      :disabled="!authenticated"
      item-title="text"
      item-value="value"
      :items="modes"
      :label="label"
      variant="outlined"
      @update:model-value="setMode"
    />
  </v-list-item>
</template>

<script>
  import { mapActions, mapState } from "pinia";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "TelescopeModeChange",
    data() {
      return {
        modes: [
          {
            text: "Off",
            value: "off",
          },
          {
            text: "Raw",
            value: "raw",
          },
          {
            text: "Diagnose",
            value: "diag",
          },
          {
            text: "Visibility",
            value: "vis",
          },
        ],
      };
    },
    methods: {
      ...mapActions(useAppStore, ["setTelescopeMode", "logout"]),
      setMode(mode) {
        this.setTelescopeMode(mode);
      },
    },
    computed: {
      label() {
        return (
          "Operating mode" +
          (this.authenticated ? "" : " (Login Required)")
        );
      },
      ...mapState(useAppStore, ["token", "telescope_mode"]),
      authenticated() {
        return this.token ? true : false;
      },
    },
  };
</script>
