import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration for the viewer.
 *
 * These tests run against an already-running dev server (default
 * http://localhost:3000) rather than starting one, because the data comes
 * through the dev server's proxy to the telescope and starting a second
 * server would fight over the port.
 *
 * Run: pnpm test:e2e
 */
export default defineConfig({
  testDir: "./user-stories",

  // Loading a visibility file is a real network round-trip plus parse, so the
  // default timeouts are generous.
  timeout: 120_000,
  expect: { timeout: 30_000 },

  // Each story drives the same running app instance; keep them serial.
  fullyParallel: false,
  workers: 1,

  // Measurements are the point here, so always print the timing lines.
  reporter: [["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: {
      // The synthesis view uses WebGL, which headless Chromium has no GPU for.
      // SwiftShader keeps it working (slower than a real GPU, so treat the
      // absolute numbers as an upper bound).
      args: ["--enable-unsafe-swiftshader"],
    },
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
