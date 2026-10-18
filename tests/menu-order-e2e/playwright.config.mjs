import { defineConfig } from "@playwright/test";

// Read-only checks against an already running local dev server (default http://localhost:3000, target dev DB).
// No webServer block: the caller starts the server. Set QA_MENU_BASE_URL to point elsewhere.
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  timeout: 60000,
  reporter: [["list"]],
  outputDir: "test-results/menu-order",
  use: {
    baseURL: process.env.QA_MENU_BASE_URL || "http://localhost:3000",
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "small-320", use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
  ],
});
