import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createAuthFixture } from "../tests/fixtures/auth.mjs";
import { assertEmptyTestDatabase, cleanupPublicFixture, emptyTracking } from "../tests/fixtures/published-data.mjs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { verifyCmsProtection } from "./lib/cms-protection.mjs";
import { removeQaDeletionLog } from "../tests/fixtures/catalog-cleanup.mjs";
import { createCmsCatalog } from "../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../src/server/cms/request-policy.mjs";

// Cleanup is keyed on product names starting with "QA " (the prefix every QA card uses), never on
// revision/category tables. It refuses to run unless the owner connection is the local test database.
const QA_PREFIX = "QA ";
const assertLocalTestDatabase = async owner => {
  const { rows: [row] } = await owner.query("SELECT current_database() AS db, coalesce(host(inet_server_addr()), '127.0.0.1') AS host");
  assert.equal(row.db, "tiny_osaka_test", "QA cleanup refuses to run outside the test database.");
  assert.ok(["127.0.0.1", "::1"].includes(row.host), "QA cleanup refuses to run on a non-local host.");
};
const cleanQaData = async (fixture) => {
  const owner = fixture.owner;
  await assertLocalTestDatabase(owner);
  const pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  try {
    // Hard delete through the real Owner path (also publishes a valid replacement snapshot).
    const api = createCmsCatalog({ db: drizzle(pool), authenticate: async () => ({ subject: fixture.accounts[0].id, role: "owner" }) });
    for (const card of (await api.list(new Headers())).products.filter(row => row.name.startsWith(QA_PREFIX))) await api.remove(new Headers(), card.slug);
  } finally { await pool.end(); }
  const remaining = Number((await owner.query("SELECT count(*) FROM public.products")).rows[0].count);
  assert.equal(remaining, 0, "Non-QA products exist in the test database; refusing to clean the catalog.");
  const tracked = emptyTracking();
  // Page revisions created by this run's accounts (exact actor match, as before).
  const pages = (await owner.query("SELECT DISTINCT r.id,r.page_key FROM public.page_revisions r JOIN public.page_workflow_events e ON e.revision_id=r.id WHERE e.actor_id=ANY($1::text[])", [fixture.accounts.map(account => account.id)])).rows;
  tracked.pageRevisions = pages.map(row => row.id); tracked.pages = [...new Set(pages.map(row => row.page_key))];
  // Every remaining snapshot belongs to the now-empty catalog; categories are the hidden internal ones.
  tracked.revisions = (await owner.query("SELECT id FROM public.catalog_revisions")).rows.map(row => row.id);
  tracked.categories = (await owner.query("SELECT id FROM public.categories")).rows.map(row => row.id);
  await cleanupPublicFixture(owner, tracked);
  // The deletion log is append-only for everyone; only the QA rows are removed (see the helper for the guarded transaction).
  await removeQaDeletionLog(owner);
  await verifyCmsProtection(owner, "tiny_osaka_test_owner");
  await assertEmptyTestDatabase(owner);
};
const fixture = await createAuthFixture();
try {
  await fixture.owner.query("SELECT pg_advisory_lock(76210986)");
  await cleanQaData(fixture); // leftovers of an earlier interrupted run
  await verifyCmsProtection(fixture.owner, "tiny_osaka_test_owner");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/DATABASE|MIGRAT|PASSWORD|SECRET|TOKEN|API_KEY|NODE_OPTIONS/i.test(key)));
  Object.assign(env, { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL, TEST_CMS_DATABASE_URL: process.env.TEST_CMS_DATABASE_URL,
    PUBLIC_DATABASE_TARGET: "test", PUBLIC_CONTENT_SOURCE: "published", BETTER_AUTH_SECRET: fixture.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: fixture.env.BETTER_AUTH_URL, NEXT_TELEMETRY_DISABLED: "1", QA_AUTH_OWNER_EMAIL: fixture.accounts[0].email,
    QA_AUTH_STAFF_EMAIL: fixture.accounts[1].email, QA_AUTH_PASSWORD: fixture.password });
  for (const project of ["desktop", "mobile", "small-mobile"]) {
    await fixture.expireLimits(); env.QA_AUTH_PROJECT = project;
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.cms-catalog.config.mjs", "--project=" + project],
        { env, stdio: "inherit", windowsHide: true });
      child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error("Catalog CMS browser QA failed: " + code)));
    });
  }
} finally {
  try { await cleanQaData(fixture); } finally { await fixture.cleanup(); }
}
