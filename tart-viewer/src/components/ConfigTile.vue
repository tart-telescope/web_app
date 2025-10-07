<template>
  <v-card class="mx-auto" elevation="3">
    <v-card-title class="py-3  d-flex align-center">
      <v-icon class="mr-2">mdi-cog</v-icon>
      Acquisition Config
      <v-spacer />
      <v-chip
        v-if="!authenticated"
        color="warning"
        size="small"
        variant="outlined"
      >
        Login Required
      </v-chip>
    </v-card-title>

    <v-card-text class="pa-4">
      <v-overlay
        class="align-center justify-center"
        contained
        :model-value="!authenticated"
        opacity="0.1"
      >
        <v-icon color="grey" size="48">mdi-lock</v-icon>
      </v-overlay>

      <!-- Raw Data Section -->
      <v-row>
        <v-col cols="12" md="6">
          <v-card elevation="1">
            <v-checkbox
              v-model="rawSave"
              :disabled="!authenticated || loading"
              label="Save Raw Data"
              :loading="loadingRawSave"
              @change="updateRawSave"
            />

            <v-select
              v-model="rawSamplesExp"
              :disabled="!authenticated || loading"
              :items="exponentOptions"
              label="Number of Samples"
              :loading="loadingRawSamples"
              @update:model-value="updateRawSamples"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props">
                  <template #title>
                    {{ item.title }} ({{ getIntegrationTime(item.value) }}ms)
                  </template>
                </v-list-item>
              </template>
              <template #selection="{ item }">
                {{ item.title }} ({{ getIntegrationTime(item.value) }}ms)
              </template>
            </v-select>
          </v-card>
        </v-col>

        <!-- Visibility Data Section -->
        <v-col cols="12" md="6">
          <v-card elevation="1">
            <v-checkbox
              v-model="visSave"
              :disabled="!authenticated || loading"
              label="Save Visibility Data"
              :loading="loadingVisSave"
              @change="updateVisSave"
            />

            <v-select
              v-model="visSamplesExp"
              :disabled="!authenticated || loading"
              :items="exponentOptions"
              label="Number of Samples"
              :loading="loadingVisSamples"
              @update:model-value="updateVisSamples"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props">
                  <template #title>
                    {{ item.title }} ({{ getIntegrationTime(item.value) }}ms)
                  </template>
                </v-list-item>
              </template>
              <template #selection="{ item }">
                {{ item.title }} ({{ getIntegrationTime(item.value) }}ms)
              </template>
            </v-select>
          </v-card>
        </v-col>
      </v-row>

      <!-- Status Messages -->
      <v-row v-if="errorMessage || successMessage">
        <v-col cols="12">
          <v-alert
            v-if="errorMessage"
            closable
            type="error"
            variant="tonal"
            @click:close="errorMessage = ''"
          >
            {{ errorMessage }}
          </v-alert>
          <v-alert
            v-if="successMessage"
            closable
            type="success"
            variant="tonal"
            @click:close="successMessage = ''"
          >
            {{ successMessage }}
          </v-alert>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script>
  import { mapState } from 'pinia';
  import telescopeApi from '@/services/telescopeApi';
  import { useAppStore } from '@/stores/app';

  export default {
    name: 'ConfigTile',
    data() {
      return {
        // Raw data settings
        rawSave: false,
        rawSamplesExp: 22,

        // Vis data settings
        visSave: false,
        visSamplesExp: 22,

        // Loading states
        loading: false,
        loadingRawSave: false,
        loadingRawSamples: false,
        loadingVisSave: false,
        loadingVisSamples: false,

        // Messages
        errorMessage: '',
        successMessage: '',

        // Exponent options (16-24)
        exponentOptions: Array.from({ length: 9 }, (_, i) => ({
          value: i + 16,
          title: `2^${i + 16}`,
        })),
      };
    },
    computed: {
      ...mapState(useAppStore, ['token', 'TART_URL', 'telescope_mode', 'info']),
      authenticated() {
        return this.token ? true : false;
      },
      samplingFrequency() {
        // Default to 16.368 MHz if not available in info
        return this.info?.sampling_frequency || 16368000;
      },
    },
    async mounted() {
      await this.loadCurrentSettings();
    },
    methods: {
      getIntegrationTime(exp) {
        const samples = Math.pow(2, exp);
        return Math.round((samples / this.samplingFrequency) * 1000);
      },
      async loadCurrentSettings() {
        this.loading = true;
        this.errorMessage = '';

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
        } catch (error) {
          this.errorMessage = 'Failed to load current configuration settings';
          console.error('Error loading config settings:', error);
        } finally {
          this.loading = false;
        }
      },

      async updateRawSave() {
        if (!this.authenticated) return;

        this.loadingRawSave = true;
        this.errorMessage = '';
        this.successMessage = '';

        try {
          const flag = this.rawSave ? 1 : 0;
          const result = await telescopeApi.setRawSaveFlag(flag);

          if (result) {
            this.successMessage = `Raw data save ${this.rawSave ? 'enabled' : 'disabled'}`;
            // Update local state to match server response
            this.rawSave = Boolean(result.save);
          }
        } catch (error) {
          this.errorMessage = 'Failed to update raw data save setting';
          // Revert checkbox state on error
          this.rawSave = !this.rawSave;
          console.error('Error updating raw save flag:', error);
        } finally {
          this.loadingRawSave = false;
        }
      },

      async updateVisSave() {
        if (!this.authenticated) return;

        this.loadingVisSave = true;
        this.errorMessage = '';
        this.successMessage = '';

        try {
          const flag = this.visSave ? 1 : 0;
          const result = await telescopeApi.setVisSaveFlag(flag);

          if (result) {
            this.successMessage = `Visibility data save ${this.visSave ? 'enabled' : 'disabled'}`;
            // Update local state to match server response
            this.visSave = Boolean(result.save);
          }
        } catch (error) {
          this.errorMessage = 'Failed to update visibility data save setting';
          // Revert checkbox state on error
          this.visSave = !this.visSave;
          console.error('Error updating vis save flag:', error);
        } finally {
          this.loadingVisSave = false;
        }
      },

      async updateRawSamples() {
        if (!this.authenticated) return;

        this.loadingRawSamples = true;
        this.errorMessage = '';
        this.successMessage = '';

        try {
          const result = await telescopeApi.setRawNumSamplesExp(this.rawSamplesExp);

          if (result) {
            const integrationTime = this.getIntegrationTime(this.rawSamplesExp);
            this.successMessage = `Raw data samples set to 2^${this.rawSamplesExp} (${integrationTime}ms)`;
            // Update local state to match server response
            this.rawSamplesExp = result.N_samples_exp;
          }
        } catch (error) {
          this.errorMessage = 'Failed to update raw data sample count';
          console.error('Error updating raw samples exp:', error);
          // Reload current value on error
          await this.loadCurrentSettings();
        } finally {
          this.loadingRawSamples = false;
        }
      },

      async updateVisSamples() {
        if (!this.authenticated) return;

        this.loadingVisSamples = true;
        this.errorMessage = '';
        this.successMessage = '';

        try {
          const result = await telescopeApi.setVisNumSamplesExp(this.visSamplesExp);

          if (result) {
            const integrationTime = this.getIntegrationTime(this.visSamplesExp);
            this.successMessage = `Visibility data samples set to 2^${this.visSamplesExp} (${integrationTime}ms)`;
            // Update local state to match server response
            this.visSamplesExp = result.N_samples_exp;
          }
        } catch (error) {
          this.errorMessage = 'Failed to update visibility data sample count';
          console.error('Error updating vis samples exp:', error);
          // Reload current value on error
          await this.loadCurrentSettings();
        } finally {
          this.loadingVisSamples = false;
        }
      },
    },
    watch: {
      // Reload settings when login state changes
      authenticated(newVal) {
        if (newVal) {
          this.loadCurrentSettings();
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
