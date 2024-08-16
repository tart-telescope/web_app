<template>
    <v-app>
        <v-app-bar app dense dark>
            <v-app-bar-nav-icon
                @click.stop="drawer = !drawer"
            ></v-app-bar-nav-icon>
            <v-toolbar-title class="headline text-uppercase pa-0">
                <span class="cyan--text font-weight-bold">TART</span>
                <span class="font-weight-light">VIEWER</span>
            </v-toolbar-title>
            <v-spacer />
            <v-btn
                icon
                color="cyan"
                href="https://github.com/tart-telescope/web_app"
            >
                <v-icon>mdi-github</v-icon>
            </v-btn>
        </v-app-bar>

        <v-navigation-drawer v-model="drawer" app temporary dark>
            <v-list-item class="pt-5">
                <v-select
                    label="Refresh Interval (s)"
                    v-model="refreshInterval"
                    :items="refreshIntervals"
                    outlined
                />
            </v-list-item>

            <TelescopeModeChange />
            <LoginField />
            <v-divider></v-divider>
            <v-divider></v-divider>

            <v-list
                density="compact"
                v-model:selected="selected"
                :lines="false"
                nav
            >
                <v-list-item
                    v-for="(item, i) in telescopes"
                    :key="item.value"
                    :value="item.value"
                    color="primary"
                >
                    <v-list-item-title v-text="item.title"></v-list-item-title>
                </v-list-item>
            </v-list>

            <v-text-field
                :disabled="selected[0] != 'custom'"
                v-model="CUSTOM_TART_URL"
                label="Telescope API Endpoint"
            />
        </v-navigation-drawer>
        <v-main>
            <v-container fluid>
                <router-view />
            </v-container>
        </v-main>
        <AppFooter />
    </v-app>
</template>

<script>
import { useAppStore } from "@/stores/app";
import { mapState, mapActions } from "pinia";

import LoginField from "@/components/LoginField.vue";
import TelescopeModeChange from "@/components/TelescopeModeChange.vue";

export default {
    components: {
        LoginField,
        TelescopeModeChange,
    },
    name: "App",
    data: () => ({
        drawer: false,
        selected: ["mu-udm"],
        telescopes: [
            { title: "Bel Air - UdM", value: "mu-udm" },
            { title: "Rhodes", value: "za-rhodes" },
            { title: "Stellenbosch", value: "stellenbosch" },
            { title: "NZ - Dunedin", value: "nz-dunedin" },
            { title: "Custom", value: "custom" },
        ],
        enabled: false,
        refresher: null,
        refreshInterval: 10,
        refreshIntervals: [5, 10, 20, 60, 120],
        CUSTOM_TART_URL: "",
    }),
    methods: {
        ...mapActions(useAppStore, [
            "renewInfo",
            "renewVis",
            "renewGain",
            "renewSatellite",
            "renewAntennas",
            "renewChannels",
            "renewVisData",
            "renewRawData",
            "renewMode",
            "resetVis",
            "setTART_URL",
            "setCustomTART_URL",
            "synthesisData",
        ]),
        setRefresher() {
            window.clearTimeout(this.refresher);
            this.refresher = window.setTimeout(
                this.getData,
                this.refreshInterval * 1000,
            );
        },
        getData: async function () {
            this.renewMode();
            if (this.telescope_mode == "vis") {
                this.synthesisData();
                this.renewVisData();
                this.renewRawData();
            }
            if (this.telescope_mode == "diag") {
                this.renewChannels();
                this.renewRawData();
            }
            this.setRefresher();
        },
    },
    watch: {
        selected: function (newVal) {
            if (newVal.length > 0) {
                window.clearTimeout(this.refresher);
                let newPostfix = newVal[0];

                if (newPostfix == "custom") {
                    let url = this.CUSTOM_TART_URL;
                    this.setCustomTART_URL(url);
                    this.getData();
                } else {
                    this.setTART_URL(newPostfix);
                    this.CUSTOM_TART_URL = this.TART_URL;
                    this.getData();
                }
            }
        },
    },
    created: function () {
        this.getData();
    },
    beforeDestroy() {
        window.clearTimeout(this.refresher);
    },
    computed: {
        ...mapState(useAppStore, ["telescope_mode", "TART_URL"]),

        TART_URL_LOCAL: {
            get: function () {
                return this.TART_URL;
            },
            set: function (newURL) {
                this.setCustomTART_URL(newURL);
            },
        },
    },
};
</script>
