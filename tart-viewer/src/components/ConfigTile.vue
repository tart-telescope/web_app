<template>
  <v-card
    class="mx-auto"
    :style="{
      opacity: authenticated ? 1 : 0.5,
      transition: 'opacity 0.3s ease',
    }"
    :variant="authenticated ? undefined : 'tonal'"
  >
    <v-card-title class="py-3 d-flex align-center cursor-pointer" @click="showConfig = !showConfig">
      <v-icon class="mr-2" size="small">mdi-cog</v-icon>
      <span class="text-subtitle-1">Acquisition Config</span>
      <v-spacer />
      <v-chip v-if="!authenticated" color="warning" size="small" variant="outlined"> Login Required </v-chip>
      <v-btn icon size="small" variant="text">
        <v-icon>{{ showConfig ? "mdi-chevron-up" : "mdi-chevron-down" }}</v-icon>
      </v-btn>
    </v-card-title>

    <v-expand-transition>
      <v-card-text v-show="showConfig" class="pa-4">
        <!-- Visibility Data Section -->
        <v-row>
          <v-col cols="12">
            <v-card elevation="1" class="pa-3">
              <div class="d-flex align-center ga-3">
                <v-switch
                  v-model="visSave"
                  color="primary"
                  density="compact"
                  :disabled="!authenticated || loading"
                  hide-details
                  :loading="loadingVisSave"
                  @update:model-value="updateVisSave"
                />
                <v-select
                  v-model="visSamplesExp"
                  class="flex-grow-1"
                  density="compact"
                  :disabled="!authenticated || loading"
                  hide-details
                  :items="exponentOptions"
                  label="Visibility Samples"
                  :loading="loadingVisSamples"
                  @update:model-value="updateVisSamples"
                >
                  <template #item="{ props, internalItem }">
                    <v-list-item v-bind="props">
                      <template #title> {{ internalItem.title }} ({{ getIntegrationTime(internalItem.value) }}ms) </template>
                    </v-list-item>
                  </template>
                  <template #selection="{ item }"> {{ item.title }} ({{ getIntegrationTime(item.value) }}ms) </template>
                </v-select>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Raw Data Section -->
        <v-row class="mt-2">
          <v-col cols="12">
            <v-card elevation="1" class="pa-3">
              <div class="d-flex align-center ga-3">
                <v-switch
                  v-model="rawSave"
                  color="primary"
                  density="compact"
                  :disabled="!authenticated || loading"
                  hide-details
                  :loading="loadingRawSave"
                  @update:model-value="updateRawSave"
                />
                <v-select
                  v-model="rawSamplesExp"
                  class="flex-grow-1"
                  density="compact"
                  :disabled="!authenticated || loading"
                  hide-details
                  :items="exponentOptions"
                  label="Raw Samples"
                  :loading="loadingRawSamples"
                  @update:model-value="updateRawSamples"
                >
                  <template #item="{ props, internalItem }">
                    <v-list-item v-bind="props">
                      <template #title> {{ internalItem.title }} ({{ getIntegrationTime(internalItem.value) }}ms) </template>
                    </v-list-item>
                  </template>
                  <template #selection="{ item }"> {{ item.title }} ({{ getIntegrationTime(item.value) }}ms) </template>
                </v-select>
              </div>

              <!-- Time-Latched Acquisition (only shown if API supports it) -->
              <div v-if="syncSupported" class="pa-3 pt-0">
                <v-divider class="mb-3" />

                <div class="d-flex align-center mb-2">
                  <v-icon class="mr-2" size="20">mdi-clock-sync-outline</v-icon>
                  <span class="text-subtitle-2">Time-Latched Acquisition</span>
                </div>

                <v-switch
                  v-model="rawSync"
                  color="primary"
                  density="compact"
                  :disabled="!authenticated || loading"
                  hide-details
                  label="Latch raw acquisition to clock"
                  :loading="loadingRawSync"
                  @update:model-value="updateRawSync"
                />

                <v-expand-transition>
                  <div v-if="rawSync" class="mt-3">
                    <div class="text-caption text-medium-emphasis mb-2">Latch acquisition to these seconds of the minute:</div>
                    <div class="text-caption text-warning mb-2">
                      <v-icon class="mr-1" color="warning" size="14">mdi-alert</v-icon>
                      Trigger edges are skipped during data transfer
                    </div>
                    <div class="d-flex flex-wrap ga-1">
                      <v-chip
                        v-for="sec in availableSeconds"
                        :key="sec"
                        :color="syncAcquireAtSeconds.includes(sec) ? 'primary' : 'default'"
                        :disabled="!authenticated || loading || loadingSyncSeconds"
                        size="small"
                        variant="flat"
                        @click="toggleSecond(sec)"
                      >
                        {{ String(sec).padStart(2, "0") }}
                      </v-chip>
                    </div>
                    <div class="d-flex align-center mt-2 ga-2">
                      <v-btn
                        :disabled="!authenticated || loading || loadingSyncSeconds"
                        size="x-small"
                        variant="text"
                        @click="selectPreset('every10')"
                      >
                        Every 10s
                      </v-btn>

                      <v-btn
                        :disabled="!authenticated || loading || loadingSyncSeconds"
                        size="x-small"
                        variant="text"
                        @click="selectPreset('every30')"
                      >
                        Every 30s
                      </v-btn>
                      <v-btn
                        :disabled="!authenticated || loading || loadingSyncSeconds"
                        size="x-small"
                        variant="text"
                        @click="selectPreset('onTheMinute')"
                      >
                        On the minute
                      </v-btn>
                    </div>
                  </div>
                </v-expand-transition>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Status Messages -->
        <v-row v-if="errorMessage || successMessage">
          <v-col cols="12">
            <v-alert v-if="errorMessage" closable type="error" variant="tonal" @click:close="errorMessage = ''">
              {{ errorMessage }}
            </v-alert>
            <v-alert v-if="successMessage" closable type="success" variant="tonal" @click:close="successMessage = ''">
              {{ successMessage }}
            </v-alert>
          </v-col>
        </v-row>
      </v-card-text>
    </v-expand-transition>
  </v-card>
</template>

<script>
import { mapState } from "pinia";
import telescopeApi from "@/services/telescopeApi";
import { useAppStore } from "@/stores/app";

export default {
  name: "ConfigTile",
  data() {
    return {
      // UI state
      showConfig: false,

      // Raw data settings
      rawSave: false,
      rawSamplesExp: 22,

      // Vis data settings
      visSave: false,
      visSamplesExp: 22,

      // Sync settings
      rawSync: false,
      syncAcquireAtSeconds: [],
      syncSupported: false,

      // Loading states
      loading: false,
      loadingRawSave: false,
      loadingRawSamples: false,
      loadingVisSave: false,
      loadingVisSamples: false,
      loadingRawSync: false,
      loadingSyncSeconds: false,

      // Messages
      errorMessage: "",
      successMessage: "",

      // Exponent options (16-24)
      exponentOptions: Array.from({ length: 9 }, (_, i) => ({
        value: i + 16,
        title: `2^${i + 16}`,
      })),

      // Available seconds (0-59 in steps of 5 for a cleaner UI)
      availableSeconds: Array.from({ length: 12 }, (_, i) => i * 5),
    };
  },
  computed: {
    ...mapState(useAppStore, ["token", "TART_URL", "telescope_mode", "info"]),
    authenticated() {
      return this.token ? true : false;
    },
    samplingFrequency() {
      // Default to 16.368 MHz if not available in info
      return this.info?.sampling_frequency || 16_368_000;
    },
  },
  async mounted() {
    await this.loadCurrentSettings();
    // Auto-expand when authenticated
    this.showConfig = this.authenticated;
  },
  methods: {
    getIntegrationTime(exp) {
      const samples = Math.pow(2, exp);
      return Math.round((samples / this.samplingFrequency) * 1000);
    },
    async loadCurrentSettings() {
      this.loading = true;
      this.errorMessage = "";

      try {
        // Load all current settings in parallel
        const [rawSave, visSave, rawSamples, visSamples] = await Promise.all([
          telescopeApi.getRawSaveFlag(),
          telescopeApi.getVisSaveFlag(),
          telescopeApi.getRawNumSamplesExp(),
          telescopeApi.getVisNumSamplesExp(),
        ]);

        // Update local state with current values
        if (rawSave) this.rawSave = Boolean(rawSave.save);
        if (visSave) this.visSave = Boolean(visSave.save);
        if (rawSamples) this.rawSamplesExp = rawSamples.N_samples_exp;
        if (visSamples) this.visSamplesExp = visSamples.N_samples_exp;

        // Try loading sync settings — only available on newer APIs
        try {
          const [rawSync, syncSeconds] = await Promise.all([telescopeApi.getRawSync(), telescopeApi.getRawSyncAcquireAtSeconds()]);

          if (rawSync && syncSeconds) {
            this.syncSupported = true;
            this.rawSync = Boolean(rawSync.sync);
            this.syncAcquireAtSeconds = syncSeconds.sync_acquire_at_seconds || [];
          }
        } catch {
          // API doesn't support sync endpoints — leave syncSupported false
        }
      } catch (error) {
        this.errorMessage = "Failed to load current configuration settings";
        console.error("Error loading config settings:", error);
      } finally {
        this.loading = false;
      }
    },

    async updateRawSave() {
      if (!this.authenticated) return;

      this.loadingRawSave = true;
      this.errorMessage = "";
      this.successMessage = "";

      try {
        const flag = this.rawSave ? 1 : 0;
        const result = await telescopeApi.setRawSaveFlag(flag);

        if (result) {
          this.successMessage = `Raw data save ${this.rawSave ? "enabled" : "disabled"}`;
          // Update local state to match server response
          this.rawSave = Boolean(result.save);
        }
      } catch (error) {
        this.errorMessage = "Failed to update raw data save setting";
        // Revert checkbox state on error
        this.rawSave = !this.rawSave;
        console.error("Error updating raw save flag:", error);
      } finally {
        this.loadingRawSave = false;
      }
    },

    async updateVisSave() {
      if (!this.authenticated) return;

      this.loadingVisSave = true;
      this.errorMessage = "";
      this.successMessage = "";

      try {
        const flag = this.visSave ? 1 : 0;
        const result = await telescopeApi.setVisSaveFlag(flag);

        if (result) {
          this.successMessage = `Visibility data save ${this.visSave ? "enabled" : "disabled"}`;
          // Update local state to match server response
          this.visSave = Boolean(result.save);
        }
      } catch (error) {
        this.errorMessage = "Failed to update visibility data save setting";
        // Revert checkbox state on error
        this.visSave = !this.visSave;
        console.error("Error updating vis save flag:", error);
      } finally {
        this.loadingVisSave = false;
      }
    },

    async updateRawSamples() {
      if (!this.authenticated) return;

      this.loadingRawSamples = true;
      this.errorMessage = "";
      this.successMessage = "";

      try {
        const result = await telescopeApi.setRawNumSamplesExp(this.rawSamplesExp);

        if (result) {
          const integrationTime = this.getIntegrationTime(this.rawSamplesExp);
          this.successMessage = `Raw data samples set to 2^${this.rawSamplesExp} (${integrationTime}ms)`;
          // Update local state to match server response
          this.rawSamplesExp = result.N_samples_exp;
        }
      } catch (error) {
        this.errorMessage = "Failed to update raw data sample count";
        console.error("Error updating raw samples exp:", error);
        // Reload current value on error
        await this.loadCurrentSettings();
      } finally {
        this.loadingRawSamples = false;
      }
    },

    async updateVisSamples() {
      if (!this.authenticated) return;

      this.loadingVisSamples = true;
      this.errorMessage = "";
      this.successMessage = "";

      try {
        const result = await telescopeApi.setVisNumSamplesExp(this.visSamplesExp);

        if (result) {
          const integrationTime = this.getIntegrationTime(this.visSamplesExp);
          this.successMessage = `Visibility data samples set to 2^${this.visSamplesExp} (${integrationTime}ms)`;
          // Update local state to match server response
          this.visSamplesExp = result.N_samples_exp;
        }
      } catch (error) {
        this.errorMessage = "Failed to update visibility data sample count";
        console.error("Error updating vis samples exp:", error);
        // Reload current value on error
        await this.loadCurrentSettings();
      } finally {
        this.loadingVisSamples = false;
      }
    },

    async updateRawSync(value) {
      if (!this.authenticated) return;

      this.loadingRawSync = true;
      this.errorMessage = "";
      this.successMessage = "";

      try {
        const flag = value ? 1 : 0;
        const result = await telescopeApi.setRawSync(flag);

        if (result) {
          this.rawSync = Boolean(result.sync);
          this.successMessage = `Synchronized acquisition ${this.rawSync ? "enabled" : "disabled"}`;
        }
      } catch (error) {
        this.errorMessage = "Failed to update sync acquisition setting";
        this.rawSync = !value;
        console.error("Error updating raw sync flag:", error);
      } finally {
        this.loadingRawSync = false;
      }
    },

    async toggleSecond(sec) {
      if (!this.authenticated) return;

      const newSeconds = this.syncAcquireAtSeconds.includes(sec)
        ? this.syncAcquireAtSeconds.filter((s) => s !== sec)
        : [...this.syncAcquireAtSeconds, sec].toSorted((a, b) => a - b);

      await this.saveSyncSeconds(newSeconds);
    },

    async selectPreset(preset) {
      if (!this.authenticated) return;

      let newSeconds;
      switch (preset) {
        case "every10": {
          newSeconds = [0, 10, 20, 30, 40, 50];
          break;
        }
        case "every15": {
          newSeconds = [0, 15, 30, 45];
          break;
        }
        case "every30": {
          newSeconds = [0, 30];
          break;
        }
        case "onTheMinute": {
          newSeconds = [0];
          break;
        }
        default: {
          return;
        }
      }

      await this.saveSyncSeconds(newSeconds);
    },

    async saveSyncSeconds(seconds) {
      this.loadingSyncSeconds = true;
      this.errorMessage = "";
      this.successMessage = "";

      try {
        const result = await telescopeApi.setRawSyncAcquireAtSeconds(seconds);

        if (result) {
          this.syncAcquireAtSeconds = result.sync_acquire_at_seconds || seconds;
          this.successMessage = `Sync seconds updated: ${this.syncAcquireAtSeconds.map((s) => String(s).padStart(2, "0")).join(", ")}`;
        }
      } catch (error) {
        this.errorMessage = "Failed to update sync acquire-at-seconds";
        console.error("Error updating sync seconds:", error);
        // Reload to get actual server state
        await this.loadCurrentSettings();
      } finally {
        this.loadingSyncSeconds = false;
      }
    },
  },
  watch: {
    // Reload settings and expand when login state changes
    authenticated(newVal) {
      if (newVal) {
        this.loadCurrentSettings();
        this.showConfig = true;
      }
    },
    // Reload settings when telescope changes
    TART_URL() {
      this.loadCurrentSettings();
    },
  },
};
</script>

<style scoped>
.config-inactive {
  background-color: rgba(0, 0, 0, 0.05);
  opacity: 0.7;
}
</style>
