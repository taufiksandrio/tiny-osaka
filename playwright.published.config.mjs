import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/published-e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  timeout: 30000,
  reporter: [["dot"], ["json", { outputFile: process.env.QA_PUBLIC_EMPTY ? "test-results/published-empty-results.json" : "test-results/published-results.json" }]],
  outputDir: process.env.QA_PUBLIC_EMPTY ? "test-results/published-empty" : "test-results/published",
  use: { baseURL: "http://127.0.0.1:3031", browserName: "chromium", serviceWorkers: "block", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "small-mobile", use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname=127.0.0.1 --port=3031",
    url: "http://127.0.0.1:3031/",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
