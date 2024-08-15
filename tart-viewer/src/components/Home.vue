<template>
    <v-row>
        <v-col cols="12" sm="12" md="12" lg="12">
            <GeneralInfo />
        </v-col>
        <v-col
            cols="12"
            :sm="enlarge ? 12 : 12"
            :md="enlarge ? 12 : 6"
            :lg="enlarge ? 12 : 6"
            v-if="telescope_mode == 'vis'"
        >
            <Synthesis>
                <template slot="enlarge">
                    <v-btn icon @click="enlarge = ~enlarge">
                        <v-icon small v-if="enlarge">
                            mdi-magnify-minus
                        </v-icon>
                        <v-icon small v-else> mdi-magnify-plus </v-icon>
                    </v-btn>
                </template>
            </Synthesis>
        </v-col>
        <v-col cols="12" sm="12" md="6" lg="6" v-if="telescope_mode == 'vis'">
            <Baseline />
        </v-col>
        <v-col cols="12" sm="12" md="6" lg="6" v-if="telescope_mode == 'vis'">
            <ArrayLayout />
        </v-col>
        <v-col cols="12" sm="12" md="6" lg="6" v-if="telescope_mode == 'diag'">
            <RadioSpectrum />
        </v-col>
        <v-col cols="12" sm="12" md="6" lg="6">
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
    data() {
        return {
            enlarge: false,
        };
    },
    computed: {
        ...mapState(useAppStore, ["telescope_mode"]),
    },
};
</script>
