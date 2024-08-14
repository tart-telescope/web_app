<template>
    <v-card class="mx-auto" flat outlined elevation="3">
        <v-card-title
            class="my-0 mx-0 pt-1 pb-0 teal--text text--lighten-2 text-uppercase"
        >
            Visibility Amplitude</v-card-title
        >
        <VueApexCharts
            height="160"
            type="line"
            :options="apex.options"
            :series="apex_vis_amp"
        />
        <v-card-title
            class="my-0 mx-0 pt-0 pb-0 teal--text text--lighten-2 text-uppercase"
        >
            Visibility Phase</v-card-title
        >
        <VueApexCharts
            height="160"
            type="line"
            :options="apex_options_phase"
            :series="apex_vis_phase"
        />
        <v-card-actions class="pb-0">
            <v-range-slider
                v-model="selected_baseline"
                @update:modelValue="selectBaseline($event)"
                label="Baseline"
                thumb-label="always"
                step="1"
                :thumb-size="20"
                min="0"
                max="23"
                outlined
            />
        </v-card-actions>
    </v-card>
</template>

<script>
import VueApexCharts from "vue3-apexcharts";
import { useAppStore } from "@/stores/app";
import { mapState, mapActions } from "pinia";

export default {
    name: "BaselineComponent",
    components: {
        VueApexCharts,
    },
    props: {},
    data: function () {
        return {
            selected_baseline: [0, 23],
            apex: {
                options: {
                    grid: {
                        padding: {
                            top: -20,
                            right: 0,
                            bottom: -25,
                            left: 0,
                        },
                    },
                    xaxis: {
                        show: false,
                        type: "datetime",
                        labels: {
                            datetimeFormatter: {
                                year: "yyyy",
                                month: "MMM 'yy",
                                day: "dd MMM",
                                hour: "HH:mm:ss",
                                minute: "HH:mm:ss.ff",
                            },
                        },
                    },
                    stroke: {
                        curve: "smooth",
                        width: 2,
                    },
                    tooltip: {
                        theme: "dark",
                    },
                    chart: {
                        id: "vuechart",
                        group: "vis",
                        toolbar: {
                            show: false,
                        },
                        animations: {
                            enabled: false,
                            easing: "easeinout",
                            speed: 50,
                            animateGradually: {
                                enabled: false,
                                delay: 50,
                            },
                            dynamicAnimation: {
                                enabled: false,
                                speed: 50,
                            },
                        },
                    },
                },
            },
        };
    },
    methods: {
        ...mapActions(useAppStore, ["selectBaseline"]),
    },

    computed: {
        ...mapState(useAppStore, [
            "cal",
            "vis",
            "gain",
            "vis_history",
            "selectedBaseline",
        ]),
        ant_sel_i() {
            return this.selected_baseline[0];
        },
        ant_sel_j() {
            return this.selected_baseline[1];
        },
        apex_options_phase() {
            let options = {
                ...this.apex.options,
                yaxis: {
                    max: 180,
                    min: -180,
                },
            };
            return options;
        },
        apex_vis_amp() {
            var series = [
                {
                    name: "visReal",
                    data: [],
                },
            ];
            if (this.vis_history.length > 0) {
                series = [
                    {
                        name: "Uncalibrated Amplitude",
                        data: this.vis_history.map((x_h, idx) => ({
                            x: this.categories[idx],
                            y: x_h.data
                                .filter(
                                    (x) =>
                                        x.i == this.ant_sel_i &&
                                        x.j == this.ant_sel_j,
                                )
                                .map((x) =>
                                    Math.sqrt(x.re ** 2 + x.im ** 2).toFixed(3),
                                ),
                        })),
                    },
                ];
            }
            return series;
        },
        apex_vis_phase() {
            var series = [
                {
                    name: "Phase",
                    data: [],
                },
            ];
            if (this.vis_history.length > 0) {
                series = [
                    {
                        name: "Uncalibrated Phase",
                        data: this.vis_history.map((x_h, idx) => ({
                            x: this.categories[idx],
                            y: x_h.data
                                .filter(
                                    (x) =>
                                        x.i == this.ant_sel_i &&
                                        x.j == this.ant_sel_j,
                                )
                                .map((x) =>
                                    (
                                        (Math.atan2(x.im, x.re) * 180) /
                                        Math.PI
                                    ).toFixed(0),
                                ),
                        })),
                    },
                ];
            }
            return series;
        },

        categories() {
            return this.vis_history.map((x_h) => x_h.timestamp);
        },
    },
};
</script>
