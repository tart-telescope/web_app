// Utilities
import { defineStore } from "pinia";
import { satelliteApi, telescopeApi } from "@/services";

export const useAppStore = defineStore("app", {
  state: () => {
    const state = {
      VERSION_HASH: process.env.CI_COMMIT_SHA,
      TART_API_HUB_URL: "https://api.elec.ac.nz/tart/",
      TART_URL_DEFAULT: "https://api.elec.ac.nz/tart/zm-cbu",
      TART_URL: "https://api.elec.ac.nz/tart/zm-cbu",
      CATALOG_URL: "https://tart.elec.ac.nz/catalog",
      API_PREFIX: "/api/v1",
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
      hoveredTimestamp: null,
      currentZoomRange: null,
      lastVisDataUpdate: 0,
      lastRawDataUpdate: 0,
      dataThinning: 3,
      showTimings: false,
      nside: 64,
      antennasUsed: Array.from({ length: 24 }, (_, i) => i),
      localMode: false,
      partition_size: 6,
    };

    // Auto-detect local mode on first load based on protocol
    if (window.location.protocol === 'http:') {
      state.localMode = true;
    }

    // Configure satellite API service
    satelliteApi.setUrl(state.CATALOG_URL);

    // Initialize telescope API with default URL
    telescopeApi.setUrl(state.TART_URL);
    telescopeApi.setApiPrefix(state.API_PREFIX);

    return state;
  },
  getters: {
    // Extract telescope name from TART_URL (e.g., "zm-cbu" from "https://api.elec.ac.nz/tart/zm-cbu")
    telescopeName: (state) => {
      if (state.localMode) {
        return "local";
      }
      if (!state.TART_URL) {
        return "zm-cbu";
      }
      const urlParts = state.TART_URL.split("/").filter(
        (part) => part.length > 0,
      );
      const telescopeName = urlParts.at(-1);
      return telescopeName || "zm-cbu";
    },

    // Get current visibility data based on hovered timestamp or latest vis data
    currentVisData: (state) => {
      if (!state.hoveredTimestamp || state.vis_history.length === 0) {
        return state.vis;
      }

      return (
        state.vis_history.find(
          (v) => v.timestamp.toString() === state.hoveredTimestamp.toString(),
        ) || state.vis
      );
    },
  },
  actions: {
    async auth(pw) {
      this.authenticating = true;
      const response = await telescopeApi.authenticate(pw);
      if (response) {
        this.token = response.access_token;
      }
      this.authenticating = false;
    },

    setTART_URL(postFix) {
      if (postFix === 'local') {
        this.setLocalMode(true);
      } else {
        this.setLocalMode(false);
        this.setCustomTART_URL(this.TART_API_HUB_URL + postFix);
      }
    },
    setCustomTART_URL(newUrl) {
      this.logout();
      this.resetUI();
      this.TART_URL = newUrl;
      // Configure telescope API with new URL
      telescopeApi.setUrl(newUrl);
      telescopeApi.setApiPrefix(this.API_PREFIX);
      // Note: API calls will be made after router confirms telescope is valid
    },
    setLocalMode(enabled) {
      this.localMode = enabled;
      if (enabled) {
        // Local mode: empty TART_URL (same origin) with API_PREFIX
        this.logout();
        this.resetUI();
        this.TART_URL = "";
        telescopeApi.setUrl("");
        telescopeApi.setApiPrefix(this.API_PREFIX);
      } else {
        // Exit local mode: restore default URL
        this.setCustomTART_URL(this.TART_URL_DEFAULT);
      }
    },
    async setTelescopeMode(newMode) {
      const response = await telescopeApi.setMode(newMode);
      if (response && response.mode) {
        this.telescope_mode = response.mode;
      }
    },
    selectBaseline(val) {
      this.selectedBaseline = val;
    },
    setHoveredTimestamp(timestamp) {
      this.hoveredTimestamp = timestamp;
    },
    clearHoveredTimestamp() {
      this.hoveredTimestamp = null;
    },
    setZoomRange(range) {
      this.currentZoomRange = range;
    },
    clearZoomRange() {
      this.currentZoomRange = null;
    },
    logout() {
      this.token = "";
      telescopeApi.clearToken();
    },
    async newVisData() {
      const response = await telescopeApi.createVisData();
      if (response) {
        this.visDataList = response;
      }
    },
    async newRawData() {
      const response = await telescopeApi.createRawData();
      if (response) {
        this.rawDataList = response;
      }
    },
    setDataThinning(value) {
      this.dataThinning = value;
    },
    setShowTimings(value) {
      this.showTimings = value;
    },
    setNside(value) {
      this.nside = value;
    },
    setPartitionSize(value) {
      this.partition_size = value;
    },
    setAntennasUsed(antennas) {
      this.antennasUsed = antennas;
    },
    toggleAntenna(antennaId) {
      const index = this.antennasUsed.indexOf(antennaId);
      if (this.antennasUsed.includes(antennaId)) {
        this.antennasUsed.splice(index, 1);
      } else {
        this.antennasUsed.push(antennaId);
        this.antennasUsed.sort((a, b) => a - b);
      }
    },
    async renewChannels() {
      const response = await telescopeApi.getChannelStatus();
      if (response) {
        this.channels = response;
      }
    },
    async renewInfo() {
      const response = await telescopeApi.getInfo();
      if (response && response.info) {
        this.info = response.info;
      }
    },
    async renewVisData() {
      const now = Date.now();
      // Only update if more than 60 seconds have passed
      if (now - this.lastVisDataUpdate > 60_000) {
        this.lastVisDataUpdate = now;
        const response = await telescopeApi.getVisDataList();
        if (response) {
          this.visFileList = response;
        }
      }
    },
    async renewRawData() {
      const now = Date.now();
      // Only update if more than 60 seconds have passed
      if (now - this.lastRawDataUpdate > 60_000) {
        this.lastRawDataUpdate = now;
        const response = await telescopeApi.getRawDataList();
        if (response) {
          this.rawFileList = response;
        }
      }
    },
    async renewAntennas() {
      const response = await telescopeApi.getAntennaPositions();
      if (response) {
        this.antennas = response;
      }
    },
    async renewMode() {
      const response = await telescopeApi.getCurrentMode();
      if (response && response.mode) {
        this.telescope_mode = response.mode;
      }
    },
    async enrichBulkSatellites() {
      const timestamps = this.vis_history
        .filter((vis) => vis.satellites?.length === 0)
        .map((vis) => vis.timestamp);

      if (timestamps.length === 0) {
        return;
      }
      if (
        this.info.location.lat === undefined ||
        this.info.location.lon === undefined
      ) {
        return;
      }

      const response = await satelliteApi.getBulkAzEl(
        this.info.location.lat,
        this.info.location.lon,
        0, // this.info.location.alt,
        timestamps
      );

      if (!response) {return;}

      const responseTimestamps = response.dates;
      for (const [i, timestamp_] of responseTimestamps.entries()) {
        const timestamp = new Date(timestamp_);
        const az_el = response.az_el[i];
        for (const vis of this.vis_history) {
          // if time_delta is less than 0.01s
          if (Math.abs(vis.timestamp - timestamp) < 10) {
            vis.satellites = az_el.map((satellite) => ({
              name: satellite.name,
              az: satellite.az,
              el: satellite.el,
            }));
          }
        }
      }
    },
    async synthesisData() {
      console.log('🔄 synthesisData() called');
      console.log('📡 Current telescope mode:', this.telescope_mode);
      console.log('📍 Current TART_URL:', this.TART_URL);
      console.log('📊 Current vis_history length:', this.vis_history.length);
      const synthesisData = await telescopeApi.getSynthesisData();
      if (!synthesisData) {
        console.log('❌ No synthesis data received');
        return;
      }
      console.log('📊 Synthesis data received:', {
        hasVis: !!synthesisData.vis,
        hasGain: !!synthesisData.gain,
        hasAntennas: !!synthesisData.antennas,
        visTimestamp: synthesisData.vis?.timestamp,
        visDataLength: synthesisData.vis?.data?.length
      });

      const { vis, gain, antennas } = synthesisData;

      const visData = vis;
      const gainsData = gain;
      const antPos = antennas;
      const info = this.info;

      console.log('📈 Processing vis data:', {
        timestamp: visData?.timestamp,
        dataLength: visData?.data?.length || 0,
        hasGain: !!gainsData,
        hasAntennas: !!antPos,
        currentHistoryLength: this.vis_history.length
      });

      // Safety check for info.location before accessing coordinates
      if (!info || !info.location) {
        console.warn('Telescope info not loaded yet, skipping satellite catalog');
        return;
      }

      const catalogData = await satelliteApi.getCatalog(
        visData.timestamp,
        info.location.lat,
        info.location.lon,
        0
      );

      if (catalogData) {
        const satellites = catalogData
          .filter((sat) => sat.el > 4)
          .map((sat) => {
            return {
              el: sat.el,
              az: sat.az,
              name: sat.name,
            };
          });
        this.sat_list = satellites;

        // Store visibility with satellite data in history
        const visWithSatellites = {
          ...visData,
          satellites,
          gain: gainsData,
          antennas: antPos,
        };

        while (this.vis_history.length > 3600) {
          this.vis_history.shift();
        }
        console.log('➕ Adding to vis_history:', {
          timestamp: visWithSatellites.timestamp,
          previousLength: this.vis_history.length,
          satelliteCount: satellites.length
        });
        this.vis_history.push(visWithSatellites);
        console.log('✅ vis_history updated, new length:', this.vis_history.length);
      } else {
        console.log('❌ No catalog data received for satellites');
      }

      this.antennas = antPos;
      this.gain = gainsData;
      this.info = info;
      this.vis = visData;
    },
    resetUI() {
      delete this.vis_history;
      this.vis_history = [];
      this.vis = null;
      this.gain = null;
      this.antennas = [];
      this.sat_list = [];
      this.lastVisDataUpdate = 0;
      this.lastRawDataUpdate = 0;
      telescopeApi.reset();
    },
    async renewGain() {
      const response = await telescopeApi.getGain();
      if (response) {
        this.gain = response;
      }
    },
    async renewSatellite() {
      if (this.info && this.info.location && this.vis && this.vis.timestamp) {
        const catalogData = await satelliteApi.getCatalog(
          this.vis.timestamp,
          this.info.location.lat,
          this.info.location.lon,
          0
        );

        if (catalogData) {
          this.sat_list = catalogData;
        }
      }
    },
  },
});
