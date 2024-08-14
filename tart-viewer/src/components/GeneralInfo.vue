<template>
    <v-card outlined elevation="1">
        <v-card-title
            @click="show = !show"
            class="teal--text text--lighten-2 text-uppercase"
        >
            <div class="d-flex justify-space-between">
                GENERAL INFO
                <v-btn icon>
                    <v-icon>{{
                        show ? "mdi-chevron-up" : "mdi-chevron-down"
                    }}</v-icon>
                </v-btn>
            </div>
        </v-card-title>

        <v-expand-transition>
            <v-card-text v-show="show">
                <v-row class="pa-0 ma-0">
                    <v-col
                        class="pa-2"
                        cols="6"
                        sm="3"
                        md="3"
                        v-for="(i, key) in info"
                        :key="key"
                    >
                        <v-sheet
                            class="pa-3 ma-2 pb-0 mb-2"
                            height="100%"
                            rounded
                            color="#1b4e7f"
                            elevation="1"
                        >
                            <div class="text-uppercase">
                                {{ key.replace("_", " ") }}
                            </div>
                            <div class="">{{ i }}</div>
                        </v-sheet>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-expand-transition>
    </v-card>
</template>

<script>
import { useAppStore } from "@/stores/app";
import { mapActions, mapState } from "pinia";

export default {
    name: "GeneralInfo",
    components: {},
    props: {},
    data: function () {
        return {
            pass: "",
            show: false,
            localInfo: {},
        };
    },
    computed: {
        ...mapState(useAppStore, ["info"]),
    },
};
</script>
