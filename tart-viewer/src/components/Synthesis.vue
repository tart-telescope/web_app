<template>
    <v-alert
        dense
        v-if="telescope_mode != 'vis'"
        type="warning"
        prominent
        outlined
    >
        <div class="title">Operating Mode: {{ telescope_mode }}</div>
        <div>
            Visibilities most likely outdated because the telescope is currently
            not operating in visibility mode.
        </div>
    </v-alert>
    <v-card class="mx-auto" elevation="3">
        <v-card-title
            class="my-0 py-0 teal--text text--lighten-2 text-uppercase"
        >
            <v-row>
                <v-col> Realtime View </v-col>
                <v-col class="text-right"> {{ render_ms.toFixed(0) }} ms</v-col>
            </v-row>
        </v-card-title>
        <div id="container" class="mx-2">Getting ready... Loading...</div>
        <v-card-actions class="py-0 my-0">
            <v-slider
                @end="setNside($event)"
                v-model="nside"
                step="2"
                thumb-label="always"
                label="NSide"
                :min="2"
                :max="128"
            />
        </v-card-actions>
        <v-card elevation="0" class="py-0 my-0">
            <v-overlay
                v-model="overlay"
                class="align-center justify-center"
                contained
                opacity="0.9"
            >
                <p class="text-secondary text-subtitle-2">
                    Object: {{ srcLoc[2] }}
                </p>
                <p class="text-secondary text-subtitle-1">
                    Elevation: {{ srcLoc[0].toFixed(1) }}
                </p>
                <p class="text-secondary text-subtitle-1">
                    Azimuth: {{ srcLoc[1].toFixed(1) }}
                </p>
            </v-overlay>

            <v-card-actions class="py-0 my-0 justify-space-between">
                <v-switch v-model="show_sat" label="Overlay Satellites" />
                <v-switch v-model="show_antennas" label="Toggle Antennas" />
            </v-card-actions>
        </v-card>

        <v-expand-transition>
            <div v-show="show_antennas">
                <v-divider />
                <v-card-title
                    class="my-0 py-1 pr-0"
                    teal--text
                    text--lighten-2
                    text-uppercase
                >
                    Antennas for Imaging
                </v-card-title>
                <v-card-actions class="py-0 my-0">
                    <v-row class="ma-0 pa-0">
                        <v-col
                            v-for="ant in antennasIdx"
                            :key="'ant' + ant"
                            cols="2"
                            class="ma-0 pa-0 mx-auto"
                        >
                            <v-checkbox
                                v-model="antennasUsed"
                                :label="ant.toString()"
                                :value="ant"
                                class="mx-auto"
                            ></v-checkbox>
                        </v-col>
                    </v-row>
                </v-card-actions>
                <v-card-actions v-if="reducedVis">
                    Number of contributing baselines:
                    {{ reducedVis.data.length }}
                </v-card-actions>
            </div>
        </v-expand-transition>
    </v-card>
</template>

<script>
import { useAppStore } from "@/stores/app";
import { mapActions, mapState } from "pinia";
const wasm = await import("wasm-tart-imaging");
// import axios from "axios";

function addHover(vm) {
    [].forEach.call(document.getElementsByTagName("circle"), function (el) {
        if (el.getAttribute("name")) {
            el.setAttribute("fill", "#ffffff20");
            el.setAttribute("stroke-width", 15);
            el.addEventListener("mouseenter", function (e) {
                vm.srcLoc = [
                    parseFloat(e.target.getAttribute("el")),
                    parseFloat(e.target.getAttribute("az")),
                    e.target.getAttribute("name"),
                ];
                e.target.setAttribute("stroke", "white");
            });
            el.addEventListener("mouseleave", function (e) {
                vm.srcLoc = [0, 0, ""];
                e.target.setAttribute("stroke", "red");
            });
        }
    });
}

export default {
    name: "SynthesisComponent",
    components: {},
    data: function () {
        return {
            wasm: wasm,
            render_ms: 0,
            loaded: false,
            show_sat: true,
            show_antennas: false,
            nside: 36,
            srcLoc: [0, 0, ""],
            antennasIdx: [
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
                18, 19, 20, 21, 22, 23,
            ],
            antennasUsed: [
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
                18, 19, 20, 21, 22, 23,
            ],
        };
    },
    watch: {
        sat_list: function () {
            this.redraw();
        },
        // wasm: function () {
        //     this.redraw();
        // },
        // reducedVis: function () {
        //     this.redraw();
        // },
        show_sat: function () {
            this.redraw();
        },
    },
    created() {
        this.loaded = true;
    },
    methods: {
        setNside: function (n) {
            this.nside = n;
            this.redraw();
        },
        redraw: function () {
            if (
                this.reducedVis &&
                this.antennas &&
                this.gain &&
                this.wasm.json_to_svg_ext
            ) {
                let start = performance.now();
                let newJ = {
                    info: { info: this.info },
                    ant_pos: this.antennas,
                    gains: this.gain,
                    data: [[this.reducedVis, this.sat_list]],
                };
                if (
                    newJ.ant_pos === null ||
                    newJ.gains === null ||
                    newJ.data[0][0] === null ||
                    newJ.data[0][1].length === 0
                ) {
                    return;
                }

                try {
                    let ret = wasm.json_to_svg_ext(
                        JSON.stringify(newJ),
                        this.nside,
                        this.show_sat,
                    );
                    var container = document.getElementById("container");
                    container.innerHTML = ret.replace(
                        'width="12cm" height="12cm"',
                        "",
                    );
                } catch (e) {
                    console.error(e);
                    return;
                } finally {
                    this.render_ms = performance.now() - start;
                    addHover(this);
                }

                // axios
                //     .post("http://localhost:8000/", {
                //         params: newJ,
                //         nside: this.nside,
                //         show_sat: this.show_sat,
                //     })
                //     .then((response) => {
                //         var ret = Object.freeze(response.data);
                //         var container = document.getElementById("container");
                //         container.innerHTML = ret.replace(
                //             'width="12cm" height="12cm"',
                //             "",
                //         );
                //         let vm = this;
                //         addHover(vm);
                //         this.render_ms = performance.now() - start;
                //     });
            }
        },
    },
    computed: {
        ...mapState(useAppStore, [
            "info",
            "vis",
            "gain",
            "antennas",
            "sat_list",
            "telescope_mode",
            "sel_baseline",
        ]),
        overlay() {
            return this.srcLoc[2] != "";
        },
        reducedVis() {
            if (this.vis) {
                let data = this.vis.data.filter(
                    (v) =>
                        this.antennasUsed.includes(v.i) &&
                        this.antennasUsed.includes(v.j),
                );
                let ts = this.vis.timestamp;
                var reduced_vis = {
                    data: data,
                    timestamp: ts,
                };
                return reduced_vis;
            }
        },
        ant_sel_i() {
            return this.sel_baseline[0];
        },
        ant_sel_j() {
            return this.sel_baseline[1];
        },
    },
};
</script>
