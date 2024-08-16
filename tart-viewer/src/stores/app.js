// Utilities
import { defineStore } from "pinia";
import { Axios, all } from "axios";
import axios from "axios";

export const useAppStore = defineStore("app", {
  state: () => ({
    VERSION_HASH: process.env.CI_COMMIT_SHA,
    TART_API_HUB_URL: "https://api.elec.ac.nz/tart/",
    TART_URL: "https://api.elec.ac.nz/tart/mu-udm",
    CATALOG_URL: "https://tart.elec.ac.nz/catalog",
    num_bin: 512,
    nw: 128,
    vis: null,
    gain: null,
    antennas: [],
    selectedBaseline: [0, 23],
    sat_list: [],
    vis_history: [],
    telescope_mode: "vis",
    telescope_modes: ["off", "diag", "raw", "vis"],
    loading: false,
    info: {},
    token: "",
    visDataList: [],
    rawDataList: [],
    visFileList: [],
    rawFileList: [],
    channels: [],
    authenticating: false,
  }),
  actions: {
    auth(pw) {
      this.authenticating = true;
      let data = { username: "admin", password: pw };
      axios
        .post(this.TART_URL + "/api/v1/auth", data)
        .then((response) => {
          this.token = Object.freeze(response.data).access_token;
          this.authenticating = false;
        })
        .catch(() => {
          this.authenticating = false;
        });
    },

    setTART_URL(postFix) {
      this.setCustomTART_URL(this.TART_API_HUB_URL + postFix);
    },
    setCustomTART_URL(newUrl) {
      this.resetUI();
      this.TART_URL = newUrl;
      this.renewMode();
      this.renewInfo();
      this.renewAntennas();
    },
    setTelescopeMode(newMode) {
      let headers = { Authorization: "JWT " + this.token };
      axios
        .post(
          this.TART_URL + "/api/v1/mode/" + newMode,
          {},
          { headers: headers },
        )
        .then((response) => {
          this.telescope_mode = Object.freeze(response.data);
        });
    },
    selectBaseline(val) {
      this.selectedBaseline = val;
    },
    logout() {
      this.token = "";
    },
    newVisData() {
      axios.post(this.TART_URL + "/api/v1/vis/data").then((response) => {
        this.visDataList = Object.freeze(response.data);
      });
    },
    newRawData() {
      axios.post(this.TART_URL + "/api/v1/raw/data").then((response) => {
        this.rawDataList = Object.freeze(response.data);
      });
    },
    renewChannels() {
      axios.get(this.TART_URL + "/api/v1/status/channel").then((response) => {
        this.channels = Object.freeze(response.data);
      });
    },
    renewInfo() {
      axios.get(this.TART_URL + "/api/v1/info").then((response) => {
        this.info = Object.freeze(response.data.info);
      });
    },
    renewVisData() {
      axios.get(this.TART_URL + "/api/v1/vis/data").then((response) => {
        this.visFileList = Object.freeze(response.data);
      });
    },
    renewRawData() {
      axios.get(this.TART_URL + "/api/v1/raw/data").then((response) => {
        this.rawFileList = Object.freeze(response.data);
      });
    },
    renewAntennas() {
      axios
        .get(this.TART_URL + "/api/v1/imaging/antenna_positions")
        .then((response) => {
          this.antennas = Object.freeze(response.data);
        });
    },
    renewMode() {
      axios.get(this.TART_URL + "/api/v1/mode/current").then((response) => {
        this.telescope_mode = Object.freeze(response.data.mode);
      });
    },
    synthesisData() {
      all([
        axios.get(this.TART_URL + "/api/v1/imaging/vis"),
        axios.get(this.TART_URL + "/api/v1/calibration/gain"),
        axios.get(this.TART_URL + "/api/v1/imaging/antenna_positions"),
        axios.get(this.TART_URL + "/api/v1/info"),
      ]).then(
        axios.spread((data1, data2, data3, data4) => {
          let vis = Object.freeze(data1.data);
          let gains = Object.freeze(data2.data);
          let ant_pos = Object.freeze(data3.data);
          let info = Object.freeze(data4.data.info);

          const api_call =
            this.CATALOG_URL +
            "/catalog?date=" +
            vis.timestamp +
            "&lat=" +
            info.location.lat +
            "&lon=" +
            info.location.lon;
          axios.get(api_call).then((response) => {
            this.sat_list = Object.freeze(response.data);
          });

          this.antennas = ant_pos;
          this.gain = gains;
          this.info = info;
          this.vis = vis;
          if (this.vis_history.length > 40) {
            this.vis_history.shift();
          }
          this.vis_history.push(vis);
        }),
      );
    },
    resetUI() {
      delete this.vis_history;
      this.vis_history = [];
      this.vis = null;
      this.gain = null;
      this.antennas = [];
      this.sat_list = [];
    },
    renewGain() {
      axios.get(this.TART_URL + "/api/v1/calibration/gain").then((response) => {
        this.gain = Object.freeze(response.data);
      });
    },
    renewSatellite() {
      if (this.info && this.info.location && this.vis && this.vis.timestamp) {
        const api_call =
          this.CATALOG_URL +
          "/catalog?date=" +
          this.vis.timestamp +
          "&lat=" +
          this.info.location.lat +
          "&lon=" +
          this.info.location.lon;
        axios.get(api_call).then((response) => {
          this.sat_list = Object.freeze(response.data);
        });
      }
    },
  },
});
