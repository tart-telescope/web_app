<template>
  <v-app>
    <v-app-bar app dark dense>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
      <v-toolbar-title class="headline text-uppercase pa-0">
        <span class="cyan--text font-weight-bold">TART</span>
        <span class="font-weight-light">VIEWER</span>
      </v-toolbar-title>
      <v-spacer />
      <v-btn color="cyan" href="https://github.com/tart-telescope/web_app" icon>
        <v-icon>mdi-github</v-icon>
      </v-btn>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" app dark temporary>
      <v-list-item class="pt-5">
        <v-select
          v-model="refreshInterval"
          :items="refreshIntervals"
          label="Refresh Interval (s)"
          outlined
        />
      </v-list-item>

      <TelescopeModeChange />
      <v-divider />
      <LoginField />
      <v-divider />

      <v-progress-circular
        v-if="loadingTelescopes"
        class="ma-4"
        color="primary"
        indeterminate
      />

      <v-list
        v-else
        v-model:selected="selectedArray"
        density="compact"
        :lines="false"
        nav
      >
        <v-list-item
          v-for="item in telescopes"
          :key="item.value"
          :class="{
            'text-disabled': item.value !== 'custom' && item.online === false,
            'v-list-item--variant-tonal': item.value === 'custom'
          }"
          color="primary"
          :disabled="item.value !== 'custom' && item.online === false"
          :value="item.value"
        >
          <template #prepend>
            <v-icon
              v-if="item.value !== 'custom'"
              :color="item.online ? 'green' : 'grey'"
              size="small"
            >
              {{ item.online ? 'mdi-circle' : 'mdi-circle-outline' }}
            </v-icon>
            <v-icon
              v-else
              color="primary"
              size="small"
            >
              mdi-cog
            </v-icon>
          </template>
          <v-list-item-title
            :class="{
              'text-medium-emphasis': item.value !== 'custom' && item.online === false,
              'text-primary': item.value === 'custom',
              'font-weight-medium': item.value === 'custom'
            }"
          >
            {{ item.title }}
          </v-list-item-title>
          <template #append>
            <v-chip
              v-if="item.currentMode && item.value !== 'custom' && item.online"
              :color="item.currentMode === 'TELESCOPE_MODE_VIS' ? 'primary' : 'default'"
              size="x-small"
              :variant="item.currentMode === 'TELESCOPE_MODE_VIS' ? 'flat' : 'outlined'"
            >
              {{ item.currentMode.replace('TELESCOPE_MODE_', '') }}
            </v-chip>
            <v-chip
              v-else-if="item.value !== 'custom' && !item.online"
              color="grey"
              size="x-small"
              variant="outlined"
            >
              OFFLINE
            </v-chip>
            <v-icon
              v-else-if="item.value === 'custom'"
              color="primary"
              size="small"
            >
              mdi-chevron-right
            </v-icon>
          </template>
        </v-list-item>

        <v-expand-transition>
          <div v-if="currentTelescope === 'custom'" class="pa-3">
            <v-text-field
              v-model="CUSTOM_TART_URL"
              clearable
              label="Custom Telescope API Endpoint"
              placeholder="https://your-telescope.example.com/api"
              :rules="[urlValidationRule]"
              validate-on="blur"
              @blur="validateAndApplyCustomUrl"
              @keyup.enter="validateAndApplyCustomUrl"
            />
            <v-btn
              block
              color="primary"
              :disabled="!isValidUrl(CUSTOM_TART_URL)"
              :loading="applyingCustomUrl"
              @click="applyCustomUrl"
            >
              Connect
            </v-btn>
          </div>
        </v-expand-transition>
      </v-list>

      <!-- Data Thinning Control at bottom -->
      <v-divider />
      <v-list-item class="pt-3">
        <v-select
          v-model="dataThinning"
          dense
          hide-details
          :items="dataThinningOptions"
          label="Data Thinning"
          outlined
          @update:model-value="setDataThinning"
        />
      </v-list-item>

      <!-- Timing Toggle -->
      <v-list-item>
        <v-checkbox
          v-model="showTimings"
          dense
          hide-details
          label="Show Timing Info"
          @update:model-value="setShowTimings"
        />
      </v-list-item>

      <!-- NSide Slider -->
      <v-list-item class="px-3 pb-5">
        <div class="w-100">
          <v-label class="text-caption mb-2">NSide</v-label>
          <v-slider
            v-model="nside"
            dense
            hide-details
            :max="128"
            :min="2"
            step="2"
            thumb-label="always"
            @update:model-value="setNside"
          />
        </div>
      </v-list-item>
    </v-navigation-drawer>
    <v-main>
      <v-container fluid>
        <!-- Show loading spinner while fetching telescopes on startup -->
        <div v-if="initialLoading" class="d-flex justify-center align-center" style="min-height: 60vh;">
          <div class="text-center">
            <v-progress-circular
              class="mb-6"
              color="primary"
              indeterminate
              size="64"
            />
            <h2 class="text-h4 text-grey-lighten-1 mb-4">
              Fetching telescopes...
            </h2>
            <p class="text-body-1 text-grey">
              Please wait while we load available telescopes.
            </p>
          </div>
        </div>

        <!-- Show error page when no telescopes are available -->
        <div v-else-if="showNoTelescopesError" class="d-flex justify-center align-center" style="min-height: 60vh;">
          <div class="text-center">
            <v-icon
              class="mb-6"
              color="grey-lighten-1"
              size="120"
            >
              mdi-alert-triangle
            </v-icon>
            <h2 class="text-h4 text-grey-lighten-1 mb-4">
              No telescopes available at the moment :(
            </h2>
            <p class="text-body-1 text-grey">
              Please try again later or check back soon.
            </p>
          </div>
        </div>

        <!-- Normal router view when telescopes are available -->
        <router-view v-else />
      </v-container>
    </v-main>
    <AppFooter />
  </v-app>
</template>

<script>
  import { mapActions, mapState } from "pinia";
  import { useRoute, useRouter } from "vue-router";
  import LoginField from "@/components/LoginField.vue";
  import TelescopeModeChange from "@/components/TelescopeModeChange.vue";
  import { useAppStore } from "@/stores/app";
  import { useTelescopeRegistryStore } from "@/stores/telescopeRegistry";

  export default {
    name: "App",
    components: {
      LoginField,
      TelescopeModeChange,
    },
    setup() {
      const route = useRoute();
      const router = useRouter();
      return { route, router };
    },
    data: () => ({
      drawer: false,
      selectedArray: [],
      initialLoading: true,

      enabled: false,
      refresher: null,
      refreshInterval: 10,
      refreshIntervals: [5, 10, 20, 60, 120],
      CUSTOM_TART_URL: "",
      applyingCustomUrl: false,
      dataThinningOptions: [
        { title: "All records (1:1)", value: 1 },
        { title: "Every 2nd record (1:2)", value: 2 },
        { title: "Every 3rd record (1:3)", value: 3 },
        { title: "Every 5th record (1:5)", value: 5 },
        { title: "Every 10th record (1:10)", value: 10 },
      ],
    }),
    methods: {
      ...mapActions(useAppStore, [
        "renewChannels",
        "renewVisData",
        "renewRawData",
        "renewMode",
        "renewInfo",
        "setTART_URL",
        "setCustomTART_URL",
        "synthesisData",
        "setDataThinning",
        "setShowTimings",
        "setNside",
      ]),
      ...mapActions(useTelescopeRegistryStore, [
        "initialize",
        "startPolling",
        "stopPolling",
        "refresh",
      ]),
      setRefresher() {
        window.clearTimeout(this.refresher);
        this.refresher = window.setTimeout(
          this.getData,
          this.refreshInterval * 1000,
        );
      },
      async applyCustomUrl() {
        if (!this.isValidUrl(this.CUSTOM_TART_URL)) return;

        this.applyingCustomUrl = true;
        try {
          window.clearTimeout(this.refresher);
          this.setCustomTART_URL(this.CUSTOM_TART_URL);
          await this.getData();
        } catch (error) {
          console.error('Failed to connect to custom telescope:', error);
        } finally {
          this.applyingCustomUrl = false;
        }
      },
      validateAndApplyCustomUrl() {
        if (this.isValidUrl(this.CUSTOM_TART_URL)) {
          this.applyCustomUrl();
        }
      },
      isValidUrl(url) {
        if (!url) return false;
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      urlValidationRule(value) {
        if (!value) return 'URL is required';
        if (!this.isValidUrl(value)) return 'Please enter a valid HTTP/HTTPS URL';
        return true;
      },
      getData: async function () {
        // Load telescope info first (needed for coordinates in synthesisData)
        await this.renewInfo();
        await this.renewMode();
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
      switchToTelescope(telescopeId) {
        // Simply switch to the requested telescope
        this.setTART_URL(telescopeId);
        this.CUSTOM_TART_URL = this.TART_URL;
        this.getData();
      },
    },
    watch: {
      selectedArray: function (newVal, oldVal) {
        if (newVal && newVal.length > 0) {
          window.clearTimeout(this.refresher);
          let newPostfix = newVal[0];
          if (newPostfix === "custom") {
            // Just show the custom URL input, don't switch yet
            if (!this.CUSTOM_TART_URL) {
              this.CUSTOM_TART_URL = this.TART_URL;
            }
          } else {
            // Switch to predefined telescope
            this.switchToTelescope(newPostfix);
            // Update route to match selection
            if (this.$route.params.telescope !== newPostfix) {
              this.$router.replace("/" + newPostfix);
            }
          }
        }
      },
      "$route.params.telescope": function (newTelescope) {
        if (newTelescope && this.currentTelescope !== newTelescope) {
          this.selectedArray = [newTelescope];
        }
      },
    },
    async created() {
      // Initialize telescope registry
      this.initialize();

      // Fetch telescope data only if not already loaded
      if (this.telescopes.length === 0) {
        await this.refresh();
      }
      this.initialLoading = false;

      // Start polling for telescope updates
      this.startPolling(30_000);

      // Initialize from route parameter
      const telescopeParam = this.$route.params.telescope;
      if (telescopeParam) {
        this.selectedArray = [telescopeParam];
      } else if (this.$route.path === "/") {
        // Redirect to first available telescope
        if (this.telescopes.length > 0) {
          const firstTelescope = this.telescopes[0].value;
          if (firstTelescope !== 'custom') {
            this.$router.replace("/" + firstTelescope);
            return;
          }
        }
        // If no telescopes available, stay on root
      } else {
        // No route param, use first available telescope
        if (this.telescopes.length > 0) {
          const firstTelescope = this.telescopes[0].value;
          if (firstTelescope !== 'custom') {
            this.selectedArray = [firstTelescope];
          }
        }
      }

      this.CUSTOM_TART_URL = this.TART_URL;

      // Watchers will handle telescope switching automatically
    },
    beforeUnmount() {
      window.clearTimeout(this.refresher);
      this.stopPolling();
    },
    computed: {
      ...mapState(useAppStore, ["telescope_mode", "TART_URL", "dataThinning", "showTimings", "nside"]),
      ...mapState(useTelescopeRegistryStore, {
        telescopes: 'telescopeList',
        loadingTelescopes: 'isLoading'
      }),
      currentTelescope() {
        return this.selectedArray.length > 0 ? this.selectedArray[0] : "";
      },
      showNoTelescopesError() {
        // Show error if not loading and no telescopes available
        if (this.initialLoading || this.loadingTelescopes) return false;
        const availableTelescopes = this.telescopes.filter(t =>
          t.value !== 'custom'
        );
        return availableTelescopes.length === 0;
      },
    },
  };
</script>
