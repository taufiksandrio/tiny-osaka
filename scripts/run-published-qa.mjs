import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "./lib/test-db.mjs";
import { createPublicFixture, cleanupPublicFixture, emptyTracking, token, catalogWorkflow, assertEmptyTestDatabase } from "../tests/fixtures/published-data.mjs";

const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: "inherit", windowsHide: true });
  child.on("error", reject);
  child.on("exit", code => code === 0 ? resolve() : reject(new Error("Local QA command failed: " + code)));
});
const serverEnvironment = () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/DATABASE|MIGRAT|PASSWORD|SECRET|TOKEN|API_KEY|NODE_OPTIONS/i.test(key)));
  env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
  env.PUBLIC_DATABASE_TARGET = "test"; env.PUBLIC_CONTENT_SOURCE = "published";
  env.NEXT_TELEMETRY_DISABLED = "1";
  return env;
};
const owner = await connectTestOwner();
const tracked = emptyTracking();
let server;
try {
  const fixture = await createPublicFixture(owner, tracked);
  await catalogWorkflow(drizzle(owner)).publish(token(fixture.approved));
  const env = serverEnvironment(); env.QA_PUBLIC_SLUG = fixture.slug;
  if (!process.argv.includes("--lighthouse")) {
    await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.published.config.mjs", "--grep-invert=empty database"], env);
    await cleanupPublicFixture(owner, tracked);
    Object.assign(tracked, emptyTracking());
    await assertEmptyTestDatabase(owner);
    env.QA_PUBLIC_EMPTY = "1";
    await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.published.config.mjs", "--grep=empty database"], env);
  } else {
    const { chromium } = await import("playwright");
    env.CHROME_PATH = chromium.executablePath();
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname=127.0.0.1", "--port=3031"], { env, stdio: "ignore", windowsHide: true });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch("http://127.0.0.1:3031/")).ok) { ready = true; break; } } catch { /* Wait for local server. */ }
      await delay(200);
    }
    if (!ready) throw new Error("Local Lighthouse server did not start.");
    await mkdir("test-results/lighthouse", { recursive: true });
    const toolEnv = { ...env };
    delete toolEnv.TEST_DATABASE_URL;
    for (const [name, path] of [["home", "/"], ["menu", "/menu"], ["product", "/menu/" + fixture.slug]]) {
      await run(process.execPath, [process.env.npm_execpath || "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "exec", "--yes", "--package=lighthouse@12.8.2", "--", "lighthouse",
        "http://127.0.0.1:3031" + path, "--chrome-flags=--headless", "--output=json", "--output=html", "--output-path=test-results/lighthouse/" + name, "--quiet"], toolEnv);
      const report = JSON.parse(await readFile("test-results/lighthouse/" + name + ".report.json", "utf8"));
      console.log(name, JSON.stringify(Object.fromEntries(Object.entries(report.categories).map(([key, value]) => [key, Math.round(value.score * 100)]))));
      console.log("metrics", JSON.stringify(Object.fromEntries(["largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time"].map(key => [key, report.audits[key].displayValue]))));
    }
  }
} finally {
  if (server && server.exitCode === null) {
    await new Promise(resolve => { server.once("exit", resolve); server.kill(); });
  }
  try { await cleanupPublicFixture(owner, tracked); await assertEmptyTestDatabase(owner); } finally { await owner.end(); }
}
