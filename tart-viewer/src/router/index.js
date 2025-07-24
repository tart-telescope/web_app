/**
 * router/index.ts
 *
 * Automatic routes for `./src/pages/*.vue`
 */

import { setupLayouts } from "virtual:generated-layouts";
// Composables
// eslint-disable-next-line import/no-duplicates
import { createRouter, createWebHistory } from "vue-router/auto";
// eslint-disable-next-line import/no-duplicates
import { routes } from "vue-router/auto-routes";
import { useAppStore } from "@/stores/app";
import { useTelescopeRegistryStore } from "@/stores/telescopeRegistry";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: setupLayouts(routes),
});

// Add route guard for telescope validation
router.beforeEach(async (to, from, next) => {
  const appStore = useAppStore();
  
  // Auto-detect local mode based on protocol
  if (window.location.protocol === 'http:') {
    appStore.localMode = true;
  }
  
  // In local mode, handle routing differently
  if (appStore.localMode) {
    // If trying to access a telescope route in local mode, redirect to root
    if (to.params.telescope && to.params.telescope !== 'local') {
      next('/');
      return;
    }
    // Allow local mode routes to pass through
    next();
    return;
  }
  
  // Normal mode: validate telescope parameter
  if (to.params.telescope) {
    // Don't validate 'local' telescope in normal mode - redirect to first available
    if (to.params.telescope === 'local') {
      const telescopeRegistry = useTelescopeRegistryStore();
      
      // Initialize telescope registry
      telescopeRegistry.initialize();
      
      // If we don't have telescope data yet, try to fetch it
      if (telescopeRegistry.telescopes.size === 0 && !telescopeRegistry.isLoading) {
        await telescopeRegistry.refresh();
      }
      
      const firstTelescope = Array.from(telescopeRegistry.telescopes.keys())[0];
      if (firstTelescope && firstTelescope !== 'custom') {
        next("/" + firstTelescope);
        return;
      }
      next('/');
      return;
    }
    
    const telescopeRegistry = useTelescopeRegistryStore();
    
    // Initialize telescope registry
    telescopeRegistry.initialize();
    
    // If we don't have telescope data yet, try to fetch it
    if (telescopeRegistry.telescopes.size === 0 && !telescopeRegistry.isLoading) {
      await telescopeRegistry.refresh();
    }
    
    // Check if telescope is valid (after potential fetch)
    if (!telescopeRegistry.isValidTelescope(to.params.telescope) && 
      telescopeRegistry.telescopes.size > 0) {
      // If telescope is not valid and we have some data, redirect to first available telescope
      const firstTelescope = Array.from(telescopeRegistry.telescopes.keys())[0];
      if (firstTelescope !== 'custom') {
        next("/" + firstTelescope);
        return;
      }
    }
    // If no telescopes available, let it proceed (will show error page)
  }
  next();
});

// Workaround for https://github.com/vitejs/vite/issues/11804
router.onError((err, to) => {
  if (err?.message?.includes?.("Failed to fetch dynamically imported module")) {
    if (localStorage.getItem("vuetify:dynamic-reload")) {
      console.error("Dynamic import error, reloading page did not fix it", err);
    } else {
      console.log("Reloading page to fix dynamic import error");
      localStorage.setItem("vuetify:dynamic-reload", "true");
      location.assign(to.fullPath);
    }
  } else {
    console.error(err);
  }
});

router.isReady().then(() => {
  localStorage.removeItem("vuetify:dynamic-reload");
});

export default router;