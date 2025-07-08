<template>
  <v-card class="mx-auto" elevation="3">
    <v-card-title class="py-3 teal--text text--lighten-2">
      <v-icon class="mr-2">mdi-file-download</v-icon>
      Edge Cache
    </v-card-title>

    <v-card-text class="pa-4">
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
              hide-default-footer
              hide-default-header
              :items="visFileList"
            >
              <template #item.timestamp="{ item }">
                <v-chip
                  :href="TART_URL + '/' + item.filename"
                  small
                >
                  <v-icon left x-small> mdi-download </v-icon>
                  {{ item.timestamp }}
                </v-chip>
              </template>

              <template #item.checksum="{ item }">
                <v-btn
                  icon
                  small
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
              hide-default-footer
              hide-default-header
              :items="rawFileList"
            >
              <template #item.timestamp="{ item }">
                <v-chip
                  :href="TART_URL + '/' + item.filename"
                  small
                >
                  <v-icon left x-small> mdi-download </v-icon>
                  {{ item.timestamp }}
                </v-chip>
              </template>

              <template #item.checksum="{ item }">
                <v-btn
                  icon
                  small
                  @click="copyToClipboard(item.checksum)"
                >
                  <v-icon small> mdi-clipboard </v-icon>
                </v-btn>
              </template>
            </v-data-table>
          </v-container>
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card-text>

    <v-snackbar v-model="snackbar" :timeout="1000">
      Copied sha256 checksum to clipboard
      <template #action="{ attrs }">
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
  import { mapState } from "pinia";
  import { useAppStore } from "@/stores/app";

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
