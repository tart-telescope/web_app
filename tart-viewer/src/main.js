/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// WASM
import init from "gridless";

// Composables
import { createApp } from "vue";

// Plugins
import { registerPlugins } from "@/plugins";

// Components
import App from "./App.vue";

// Note: Using individual SVG icons instead of full MDI font for better performance

const app = createApp(App);

registerPlugins(app);

// Global WASM state
window.wasmReady = false;
window.wasmError = null;

// The catalogue module (satellite positions) is initialised lazily on first
// satellite query rather than here, so it costs nothing for sessions that
// never fetch satellites. `services/satellite/localPropagation.js` owns that
// init and flips this flag once the module is loaded.
window.catalogueWasmReady = false;

// HDF5 runtime warm-up state. `services/...` flips this once the runtime is
// usable, so the e2e stories and diagnostics can wait for it.
window.h5wasmWarm = false;

/**
 * Load the HDF5 runtime in the background once the page is idle.
 *
 * `h5wasm` is a ~4.8 MB chunk plus a wasm instantiation, and it used to load
 * inside the first file load — i.e. on the click, where the user waits for it.
 * Warming it after the page's own work is done moves that off the interaction.
 *
 * Skipped when the user has asked to save data or is on a slow connection,
 * since those users may never open a file and the download is not small.
 */
function warmHdf5Runtime() {
  import("@/utils/h5wasmUtils")
    .then((m) => m.warmH5wasm())
    .then(() => {
      window.h5wasmWarm = true;
      console.log("HDF5 runtime warmed in the background");
    })
    .catch((error) => {
      // Only means the first file load pays the cost, as it did before.
      console.warn("HDF5 runtime warm-up skipped:", error);
    });
}

function scheduleHdf5Warmup() {
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) {
    return;
  }

  const warm = () => warmHdf5Runtime();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warm, { timeout: 3000 });
  } else {
    setTimeout(warm, 2000);
  }
}

/** Mount, then warm in the background — never before first paint. */
function mountApp() {
  app.mount("#app");
  scheduleHdf5Warmup();
}

// Initialize WASM before mounting the app
init()
  .then(() => {
    try {
      window.wasmReady = true;
      console.log("WASM initialized successfully and tested");
    } catch (testError) {
      console.error("WASM initialized but functions not working:", testError);
      window.wasmError = testError;
    }
    mountApp();
  })
  .catch((error) => {
    console.error("Failed to initialize WASM:", error);
    window.wasmError = error;
    // Mount app anyway - components can fall back to remote rendering
    mountApp();
  });
