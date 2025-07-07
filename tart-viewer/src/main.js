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
    app.mount("#app");
  })
  .catch((error) => {
    console.error("Failed to initialize WASM:", error);
    window.wasmError = error;
    // Mount app anyway - components can fall back to remote rendering
    app.mount("#app");
  });
