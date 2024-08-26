<template>
    <v-row>
        <v-col cols="12" sm="12" md="12" lg="12">
            <GeneralInfo />
        </v-col>
        <template v-if="telescope_mode == 'vis'">
            <v-col cols="12" sm="12" md="6" lg="4">
                <Synthesis />
            </v-col>
            <v-col cols="12" sm="12" md="6" lg="4">
                <Baseline />
            </v-col>
            <v-col cols="12" sm="12" md="6" lg="4">
                <ArrayLayout />
            </v-col>
        </template>
        <RadioSpectrum v-if="telescope_mode == 'diag'" />
        <v-col cols="12" sm="12" md="6" lg="4">
            <RecentData />
        </v-col>
    </v-row>
</template>

<script>
import Synthesis from "@/components/Synthesis.vue";
import Baseline from "@/components/Baseline.vue";
import ArrayLayout from "@/components/ArrayLayout.vue";
import RadioSpectrum from "@/components/RadioSpectrum.vue";
import GeneralInfo from "@/components/GeneralInfo.vue";
import RecentData from "@/components/RecentData.vue";

import { useAppStore } from "@/stores/app";
import { mapState } from "pinia";

export default {
    name: "home",
    components: {
        Synthesis,
        Baseline,
        ArrayLayout,
        GeneralInfo,
        RadioSpectrum,
        RecentData,
    },
    computed: {
        ...mapState(useAppStore, ["telescope_mode"]),
    },
};
</script>
