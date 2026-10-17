import auth from "./playwright.auth.config.mjs";
const config = { ...auth, testDir: "./tests/publishing-e2e",
  reporter: [["dot"], ["json", { outputFile: `test-results/publishing-${process.env.QA_AUTH_PROJECT}.json` }]],
  outputDir: `test-results/publishing-${process.env.QA_AUTH_PROJECT}` };
export default config;
