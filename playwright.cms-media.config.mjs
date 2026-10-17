import auth from "./playwright.auth.config.mjs";
const config = { ...auth, testDir: "./tests/cms-media-e2e",
  reporter: [["dot"], ["json", { outputFile: `test-results/cms-media-${process.env.QA_AUTH_PROJECT}.json` }]],
  outputDir: `test-results/cms-media-${process.env.QA_AUTH_PROJECT}` };
export default config;
