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
 * Warm the HDF5 runtime. Resolves either way: a failure only means the first
 * file load pays the cost, as it did before.
 */
async function warmHdf5Runtime() {
  try {
    const m = await import("@/utils/h5wasmUtils");
    await m.warmH5wasm();
    window.h5wasmWarm = true;
    console.log("HDF5 runtime warmed in the background");
  } catch (error) {
    console.warn("HDF5 runtime warm-up skipped:", error);
  }
}

/**
 * Warm the background runtimes once the page is idle.
 *
 * Order matters. The catalogue module is small and is needed by the satellite
 * enrichment that runs on every visibility load, so it goes first; the HDF5
 * runtime is ~4.8 MB and must not compete with it for bandwidth. Both are off
 * the critical path, so they run sequentially rather than in parallel.
 */
async function warmBackgroundRuntimes() {
  try {
    const m = await import("@/services/satellite/localPropagation");
    if (await m.warmCatalogueWasm()) {
      console.log("Catalogue runtime warmed in the background");
    }
  } catch (error) {
    console.warn("Catalogue runtime warm-up skipped:", error);
  }

  await warmHdf5Runtime();
}

function scheduleBackgroundWarmup() {
  const connection = navigator.connection;
  // Users who asked to save data, or who are on a slow link, may never open a
  // file and the HDF5 download is not small.
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) {
    return;
  }

  const warm = () => warmBackgroundRuntimes();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warm, { timeout: 3000 });
  } else {
    setTimeout(warm, 2000);
  }
}

/** Mount, then warm in the background — never before first paint. */
function mountApp() {
  app.mount("#app");
  scheduleBackgroundWarmup();
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
