import auth from "./playwright.auth.config.mjs";
const config = { ...auth, testDir: "./tests/mcp-upload-e2e",
  reporter: [["dot"], ["json", { outputFile: `test-results/mcp-upload-${process.env.QA_AUTH_PROJECT}.json` }]],
  outputDir: `test-results/mcp-upload-${process.env.QA_AUTH_PROJECT}` };
export default config;
