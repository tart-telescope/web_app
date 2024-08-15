<template>
    <v-list-item>
        <v-select
            class="mt-2"
            :label="label"
            variant="outlined"
            v-model="telescope_mode"
            item-title="text"
            item-value="value"
            :items="modes"
            @update:modelValue="setMode"
            :disabled="!authenticated"
        />
    </v-list-item>
</template>

<script>
import { useAppStore } from "@/stores/app";
import { mapState, mapActions } from "pinia";

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
            console.log(mode);
            // this.setTelescopeMode(mode);
        },
    },
    computed: {
        label() {
            return (
                "Operating mode" +
                (!this.authenticated ? " (Login Required)" : "")
            );
        },
        ...mapState(useAppStore, ["token", "telescope_mode"]),
        authenticated() {
            return this.token ? true : false;
        },
    },
};
</script>
