<template>
    <v-card class="mx-auto" outlined elevation="3">
        <v-card-title class="my-0 mx-0 pt-1 pb-0 pr-0">
            <h4 class="teal--text text--lighten-2 text-uppercase">
                Recent Data
            </h4>
        </v-card-title>

        <v-tabs v-model="tab" align-tabs="center" color="primary" fixed-tabs>
            <v-tab :value="1">Visibilities</v-tab>
            <v-tab :value="2">Raw (Baseband)</v-tab>
        </v-tabs>

        <v-tabs-window v-model="tab">
            <v-tabs-window-item :key="1" :value="1">
                <v-container fluid>
                    <v-data-table
                        dense
                        :headers="headers"
                        :items="visFileList"
                        hide-default-footer
                        hide-default-header
                    >
                        <template v-slot:item.timestamp="{ item }">
                            <v-chip
                                small
                                :href="TART_URL + '/' + item.filename"
                            >
                                <v-icon x-small left> mdi-download </v-icon>
                                {{ item.timestamp }}
                            </v-chip>
                        </template>

                        <template v-slot:item.checksum="{ item }">
                            <v-btn
                                small
                                icon
                                @click="copyToClipboard(item.checksum)"
                            >
                                <v-icon small> mdi-clipboard </v-icon>
                            </v-btn>
                        </template>
                    </v-data-table>
                </v-container>
            </v-tabs-window-item>

            <v-tabs-window-item :key="2" :value="2">
                <v-container fluid>
                    <v-data-table
                        dense
                        :headers="headers"
                        :items="rawFileList"
                        hide-default-footer
                        hide-default-header
                    >
                        <template v-slot:item.timestamp="{ item }">
                            <v-chip
                                small
                                :href="TART_URL + '/' + item.filename"
                            >
                                <v-icon x-small left> mdi-download </v-icon>
                                {{ item.timestamp }}
                            </v-chip>
                        </template>

                        <template v-slot:item.checksum="{ item }">
                            <v-btn
                                small
                                icon
                                @click="copyToClipboard(item.checksum)"
                            >
                                <v-icon small> mdi-clipboard </v-icon>
                            </v-btn>
                        </template>
                    </v-data-table>
                </v-container>
            </v-tabs-window-item>
        </v-tabs-window>

        <v-snackbar v-model="snackbar" :timeout="1000">
            Copied sha256 checksum to clipboard
            <template v-slot:action="{ attrs }">
                <v-btn
                    color="cyan"
                    text
                    v-bind="attrs"
                    @click="snackbar = false"
                >
                    Close
                </v-btn>
            </template>
        </v-snackbar>
    </v-card>
</template>

<script>
import { useAppStore } from "@/stores/app";
import { mapState } from "pinia";

export default {
    name: "RecentData",
    data() {
        return {
            tab: null,
            snackbar: false,
            headers: [
                {
                    text: "Timestamp",
                    value: "timestamp",
                    align: "left",
                    sortable: false,
                },
                {
                    text: "SHA256 Checksum",
                    value: "checksum",
                    align: "right",
                    sortable: false,
                },
            ],
        };
    },
    methods: {
        copyToClipboard(text) {
            navigator.clipboard.writeText(text);
            this.snackbar = true;
        },
    },
    computed: {
        ...mapState(useAppStore, [
            "telescope_mode",
            "visFileList",
            "rawFileList",
            "TART_URL",
        ]),
    },
};
</script>
