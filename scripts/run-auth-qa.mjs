import { spawn } from "node:child_process";
import { createAuthFixture } from "../tests/fixtures/auth.mjs";

const fixture = await createAuthFixture();
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/DATABASE|MIGRAT|PASSWORD|SECRET|TOKEN|API_KEY|NODE_OPTIONS/i.test(key)));
  Object.assign(env, { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL, PUBLIC_DATABASE_TARGET: "test", PUBLIC_CONTENT_SOURCE: "published",
    BETTER_AUTH_SECRET: fixture.env.BETTER_AUTH_SECRET, BETTER_AUTH_URL: fixture.env.BETTER_AUTH_URL, NEXT_TELEMETRY_DISABLED: "1",
    QA_AUTH_OWNER_EMAIL: fixture.accounts[0].email, QA_AUTH_STAFF_EMAIL: fixture.accounts[1].email, QA_AUTH_PASSWORD: fixture.password });
  for (const project of ["desktop", "mobile", "small-mobile"]) {
    await fixture.expireLimits(); env.QA_AUTH_PROJECT = project;
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.auth.config.mjs", "--project=" + project], { env, stdio: "inherit", windowsHide: true });
      child.on("error", reject);
      child.on("exit", code => code === 0 ? resolve() : reject(new Error("Auth browser QA failed: " + code)));
    });
  }
} finally { await fixture.cleanup(); }
