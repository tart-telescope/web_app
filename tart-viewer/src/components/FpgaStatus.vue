<template>
  <v-card :loading="loading">
      <v-card-title class="py-3 teal--text text--lighten-2 d-flex align-center">
      <v-icon left>mdi-chip</v-icon>
      FPGA Status <v-chip class="ml-2" color="info" small>ALPHA</v-chip>
      <v-spacer />      <v-chip v-show="fpgaStatus" class="ml-2" color="info" small>
        {{ fpgaStatus ? formatTimestamp(fpgaStatus.timestamp) : '--' }}
      </v-chip>

      <v-chip-group
        v-model="selectedRefreshIndex"
        active-class="primary--text"
        mandatory
        @change="updateRefreshInterval"
      >
        <v-chip
          v-for="(option, index) in refreshOptions"
          :key="index"
          outlined
          small
          :value="index"
        >
          {{ option.label }}
        </v-chip>
      </v-chip-group>
    </v-card-title>

    <v-card-text>



      <div v-show="fpgaStatus" style="opacity: 1; transition: opacity 0.3s;">
        <v-row>
          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>Acquisition System</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('AQ_SYSTEM.enabled') }">
                  <span>Enabled:</span>
                  <v-chip :color="aqSystem.enabled ? 'success' : 'grey'" small>
                    {{ aqSystem.enabled ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('AQ_SYSTEM.SDRAM_ready') }">
                  <span>SDRAM Ready:</span>
                  <v-chip :color="aqSystem.SDRAM_ready ? 'success' : 'grey'" small>
                    {{ aqSystem.SDRAM_ready ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('AQ_SYSTEM.error') }">
                  <span>Error:</span>
                  <v-chip :color="aqSystem.error ? 'error' : 'success'" small>
                    {{ aqSystem.error ? 'ERROR' : 'OK' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('AQ_SYSTEM.overflow') }">
                  <span>Overflow:</span>
                  <v-chip :color="aqSystem.overflow ? 'error' : 'success'" small>
                    {{ aqSystem.overflow ? 'ERROR' : 'OK' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('AQ_SYSTEM.state') }">
                  <span>State:</span>
                  <v-chip color="info" small>
                    {{ aqSystem.state }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('AQ_SYSTEM.512Mb') }">
                  <span>512Mb:</span>
                  <v-chip :color="aqSystem['512Mb'] ? 'success' : 'grey'" small>
                    {{ aqSystem['512Mb'] ? 'YES' : 'NO' }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>System Stats</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SYS_STATS.acq_en') }">
                  <span>Acquisition Enabled:</span>
                  <v-chip :color="sysStats.acq_en ? 'success' : 'grey'" small>
                    {{ sysStats.acq_en ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SYS_STATS.cap_en') }">
                  <span>Capture Enabled:</span>
                  <v-chip :color="sysStats.cap_en ? 'success' : 'grey'" small>
                    {{ sysStats.cap_en ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SYS_STATS.viz_en') }">
                  <span>Viz Enabled:</span>
                  <v-chip :color="sysStats.viz_en ? 'success' : 'grey'" small>
                    {{ sysStats.viz_en ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SYS_STATS.state') }">
                  <span>State:</span>
                  <v-chip color="info" small>
                    {{ sysStats.state }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SYS_STATS.cap_debug') }">
                  <span>Capture Debug:</span>
                  <v-chip :color="sysStats.cap_debug ? 'warning' : 'grey'" small>
                    {{ sysStats.cap_debug ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SYS_STATS.viz_pend') }">
                  <span>Viz Pending:</span>
                  <v-chip :color="sysStats.viz_pend ? 'warning' : 'grey'" small>
                    {{ sysStats.viz_pend ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>Timing Controller</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_SYSTEM.enabled') }">
                  <span>Enabled:</span>
                  <v-chip :color="tcSystem.enabled ? 'success' : 'grey'" small>
                    {{ tcSystem.enabled ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_SYSTEM.locked') }">
                  <span>Locked:</span>
                  <v-chip :color="tcSystem.locked ? 'success' : 'grey'" small>
                    {{ tcSystem.locked ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_SYSTEM.error') }">
                  <span>Error:</span>
                  <v-chip :color="tcSystem.error ? 'error' : 'success'" small>
                    {{ tcSystem.error ? 'ERROR' : 'OK' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_SYSTEM.source') }">
                  <span>Source:</span>
                  <v-chip color="info" small>
                    {{ tcSystem.source }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>SPI Interface</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SPI_STATS.spi_busy') }">
                  <span>SPI Busy:</span>
                  <v-chip :color="spiStats.spi_busy ? 'warning' : 'success'" small>
                    {{ spiStats.spi_busy ? 'BUSY' : 'IDLE' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SPI_STATS.FIFO_overflow') }">
                  <span>FIFO Overflow:</span>
                  <v-chip :color="spiStats.FIFO_overflow ? 'error' : 'success'" small>
                    {{ spiStats.FIFO_overflow ? 'ERROR' : 'OK' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('SPI_STATS.FIFO_underrun') }">
                  <span>FIFO Underrun:</span>
                  <v-chip :color="spiStats.FIFO_underrun ? 'error' : 'success'" small>
                    {{ spiStats.FIFO_underrun ? 'ERROR' : 'OK' }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>Acquisition Stream</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('AQ_STREAM.data') }">
                  <span>Stream Data:</span>
                  <v-chip color="info" small>
                    {{ aqStream.data }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>Timing Controller Centre</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_CENTRE.centre') }">
                  <span>Centre:</span>
                  <v-chip :color="tcCentre.centre ? 'success' : 'grey'" small>
                    {{ tcCentre.centre ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_CENTRE.drift') }">
                  <span>Drift:</span>
                  <v-chip :color="tcCentre.drift ? 'success' : 'grey'" small>
                    {{ tcCentre.drift ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_CENTRE.invert') }">
                  <span>Invert:</span>
                  <v-chip :color="tcCentre.invert ? 'warning' : 'grey'" small>
                    {{ tcCentre.invert ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_CENTRE.delay') }">
                  <span>Delay:</span>
                  <v-chip color="info" small>
                    {{ tcCentre.delay != null ? tcCentre.delay.toFixed(3) : 'N/A' }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>Timing Controller Status</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_STATUS.phase') }">
                  <span>Phase:</span>
                  <v-chip color="info" small>
                    {{ tcStatus.phase != null ? Math.round(tcStatus.phase) : 'N/A' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_STATUS.delta') }">
                  <span>Delta:</span>
                  <v-chip color="info" small>
                    {{ tcStatus.delta != null ? Math.round(tcStatus.delta) : 'N/A' }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>Timing Controller Debug</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_DEBUG.debug') }">
                  <span>Debug:</span>
                  <v-chip :color="tcDebug.debug ? 'warning' : 'grey'" small>
                    {{ tcDebug.debug ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_DEBUG.count') }">
                  <span>Count:</span>
                  <v-chip :color="tcDebug.count ? 'success' : 'grey'" small>
                    {{ tcDebug.count ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_DEBUG.shift') }">
                  <span>Shift:</span>
                  <v-chip :color="tcDebug.shift ? 'success' : 'grey'" small>
                    {{ tcDebug.shift ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('TC_DEBUG.numantenna') }">
                  <span>Num Antennas:</span>
                  <v-chip color="info" small>
                    {{ tcDebug.numantenna }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>VX System</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_SYSTEM.enabled') }">
                  <span>Enabled:</span>
                  <v-chip :color="vxSystem.enabled ? 'success' : 'grey'" small>
                    {{ vxSystem.enabled ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_SYSTEM.overwrite') }">
                  <span>Overwrite:</span>
                  <v-chip :color="vxSystem.overwrite ? 'warning' : 'grey'" small>
                    {{ vxSystem.overwrite ? 'ON' : 'OFF' }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_SYSTEM.blocksize') }">
                  <span>Block Size:</span>
                  <v-chip color="info" small>
                    {{ vxSystem.blocksize }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>VX Status</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_STATUS.bank') }">
                  <span>Bank:</span>
                  <v-chip color="info" small>
                    {{ vxStatus.bank }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_STATUS.available') }">
                  <span>Available:</span>
                  <v-chip color="info" small>
                    {{ vxStatus.available }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_STATUS.accessed') }">
                  <span>Accessed:</span>
                  <v-chip color="info" small>
                    {{ vxStatus.accessed }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_STATUS.overflow') }">
                  <span>Overflow:</span>
                  <v-chip :color="vxStatus.overflow ? 'error' : 'success'" small>
                    {{ vxStatus.overflow ? 'ERROR' : 'OK' }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="3">
            <v-card outlined>
              <v-card-subtitle>VX Stream & Debug</v-card-subtitle>
              <v-card-text>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_STREAM.data') }">
                  <span>Stream Data:</span>
                  <v-chip color="info" small>
                    {{ vxStream.data }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_DEBUG.limp') }">
                  <span>Limp:</span>
                  <v-chip color="info" small>
                    {{ vxDebug.limp }}
                  </v-chip>
                </div>
                <div class="d-flex justify-space-between mb-2" :class="{ 'flash-change': isFieldChanged('VX_DEBUG.stuck') }">
                  <span>Stuck:</span>
                  <v-chip :color="vxDebug.stuck ? 'warning' : 'success'" small>
                    {{ vxDebug.stuck}}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <v-alert v-show="!loading && !fpgaStatus" outlined type="error">
        Failed to load FPGA status
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script>
  import telescopeApi from '@/services/telescopeApi';

  export default {
    name: 'FpgaStatus',
    data() {
      return {
        fpgaStatus: null,
        previousFpgaStatus: null,
        loading: false,
        refreshInterval: 8000,
        refreshIntervalId: null,
        refreshOptions: [
          { label: '2s', value: 2000 },
          { label: '4s', value: 4000 },
          { label: '8s', value: 8000 },
        ],
        selectedRefreshIndex: 2,
        changedFields: new Set(),
      };
    },
    computed: {
      aqSystem() {
        return this.fpgaStatus?.AQ_SYSTEM || {};
      },
      sysStats() {
        return this.fpgaStatus?.SYS_STATS || {};
      },
      tcSystem() {
        return this.fpgaStatus?.TC_SYSTEM || {};
      },
      spiStats() {
        return this.fpgaStatus?.SPI_STATS || {};
      },
      aqStream() {
        return this.fpgaStatus?.AQ_STREAM || {};
      },
      tcCentre() {
        return this.fpgaStatus?.TC_CENTRE || {};
      },
      tcStatus() {
        return this.fpgaStatus?.TC_STATUS || {};
      },
      tcDebug() {
        return this.fpgaStatus?.TC_DEBUG || {};
      },
      vxSystem() {
        return this.fpgaStatus?.VX_SYSTEM || {};
      },
      vxStatus() {
        return this.fpgaStatus?.VX_STATUS || {};
      },
      vxStream() {
        return this.fpgaStatus?.VX_STREAM || {};
      },
      vxDebug() {
        return this.fpgaStatus?.VX_DEBUG || {};
      },
    },
    mounted() {
      this.fetchFpgaStatus();
      this.startAutoRefresh();
    },
    beforeUnmount() {
      this.stopAutoRefresh();
    },
    methods: {
      async fetchFpgaStatus() {
        this.loading = true;
        try {
          const newStatus = await telescopeApi.getFpgaStatus();
          this.trackChanges(newStatus);
          this.previousFpgaStatus = this.fpgaStatus;
          this.fpgaStatus = newStatus;
        } catch (error) {
          console.error('Error fetching FPGA status:', error);
          this.fpgaStatus = null;
        } finally {
          this.loading = false;
        }
      },
      startAutoRefresh() {
        this.refreshIntervalId = setInterval(() => {
          console.log("setting interval", this.refreshInterval)
          this.fetchFpgaStatus();
        }, this.refreshInterval);
      },
      stopAutoRefresh() {
        if (this.refreshIntervalId) {
          clearInterval(this.refreshIntervalId);
          this.refreshIntervalId = null;
        }
      },
      updateRefreshInterval() {
        this.stopAutoRefresh();
        this.refreshInterval = this.refreshOptions[this.selectedRefreshIndex].value;
        this.startAutoRefresh();
      },
      trackChanges(newStatus) {
        this.changedFields.clear();
        if (!this.previousFpgaStatus || !newStatus) return;

        // Track changes in nested objects
        this.checkObjectChanges('AQ_SYSTEM', this.previousFpgaStatus.AQ_SYSTEM, newStatus.AQ_SYSTEM);
        this.checkObjectChanges('SYS_STATS', this.previousFpgaStatus.SYS_STATS, newStatus.SYS_STATS);
        this.checkObjectChanges('TC_SYSTEM', this.previousFpgaStatus.TC_SYSTEM, newStatus.TC_SYSTEM);
        this.checkObjectChanges('SPI_STATS', this.previousFpgaStatus.SPI_STATS, newStatus.SPI_STATS);
        this.checkObjectChanges('AQ_STREAM', this.previousFpgaStatus.AQ_STREAM, newStatus.AQ_STREAM);
        this.checkObjectChanges('TC_CENTRE', this.previousFpgaStatus.TC_CENTRE, newStatus.TC_CENTRE);
        this.checkObjectChanges('TC_STATUS', this.previousFpgaStatus.TC_STATUS, newStatus.TC_STATUS);
        this.checkObjectChanges('TC_DEBUG', this.previousFpgaStatus.TC_DEBUG, newStatus.TC_DEBUG);
        this.checkObjectChanges('VX_SYSTEM', this.previousFpgaStatus.VX_SYSTEM, newStatus.VX_SYSTEM);
        this.checkObjectChanges('VX_STATUS', this.previousFpgaStatus.VX_STATUS, newStatus.VX_STATUS);
        this.checkObjectChanges('VX_STREAM', this.previousFpgaStatus.VX_STREAM, newStatus.VX_STREAM);
        this.checkObjectChanges('VX_DEBUG', this.previousFpgaStatus.VX_DEBUG, newStatus.VX_DEBUG);

        // Clear flash after animation duration
        setTimeout(() => {
          this.changedFields.clear();
        }, 1000);
      },
      checkObjectChanges(prefix, oldObj, newObj) {
        if (!oldObj || !newObj) return;
        for (const key in newObj) {
          if (oldObj[key] !== newObj[key]) {
            this.changedFields.add(`${prefix}.${key}`);
          }
        }
      },
      isFieldChanged(fieldPath) {
        return this.changedFields.has(fieldPath);
      },
      formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown';
        return new Date(timestamp).toLocaleString();
      },
    },
  };
</script>

<style scoped>
.fill-width {
  width: 100%;
}

.flash-change {
  animation: flash 1s ease-in-out;
}

@keyframes flash {
  0% { background-color: transparent; }
  25% { background-color: #ffeb3b; }
  75% { background-color: #ffeb3b; }
  100% { background-color: transparent; }
}
</style>
