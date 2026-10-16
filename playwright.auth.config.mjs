import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/auth-e2e", fullyParallel: false, forbidOnly: true, retries: 0, workers: 1, timeout: 30000,
  reporter: [["dot"], ["json", { outputFile: `test-results/auth-${process.env.QA_AUTH_PROJECT}.json` }]],
  outputDir: `test-results/auth-${process.env.QA_AUTH_PROJECT}`,
  use: { baseURL: "http://127.0.0.1:3033", browserName: "chromium", serviceWorkers: "block", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "small-mobile", use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname=127.0.0.1 --port=3033",
    url: "http://127.0.0.1:3033/admin/login", reuseExistingServer: false, timeout: 60000,
    env: { QA_AUTH_PASSWORD: "", QA_AUTH_OWNER_EMAIL: "", QA_AUTH_STAFF_EMAIL: "" },
  },
});
