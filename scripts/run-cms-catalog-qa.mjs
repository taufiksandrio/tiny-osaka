import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createAuthFixture } from "../tests/fixtures/auth.mjs";
import { assertEmptyTestDatabase, cleanupPublicFixture, emptyTracking } from "../tests/fixtures/published-data.mjs";
import { verifyCmsProtection } from "./lib/cms-protection.mjs";
const fixture = await createAuthFixture();
try {
  await fixture.owner.query("SELECT pg_advisory_lock(76210986)");
  await assertEmptyTestDatabase(fixture.owner);
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
  try {
    const tracked = emptyTracking();
    const rows = (await fixture.owner.query("SELECT DISTINCT r.id,r.page_key FROM public.page_revisions r JOIN public.page_workflow_events e ON e.revision_id=r.id WHERE e.actor_id=ANY($1::text[])", [fixture.accounts.map(account => account.id)])).rows;
    assert.equal(Number((await fixture.owner.query("SELECT count(*) FROM public.page_revisions")).rows[0].count), rows.length, "Only this run's exact actor-owned revisions may be cleaned.");
    tracked.pageRevisions = rows.map(row => row.id); tracked.pages = [...new Set(rows.map(row => row.page_key))];
    const catalog = (await fixture.owner.query("SELECT DISTINCT r.id FROM public.catalog_revisions r JOIN public.catalog_workflow_events e ON e.revision_id=r.id WHERE e.actor_id=ANY($1::text[])", [fixture.accounts.map(account => account.id)])).rows;
    assert.equal(Number((await fixture.owner.query("SELECT count(*) FROM public.catalog_revisions")).rows[0].count), catalog.length, "Only actor-owned catalog revisions may be cleaned.");
    tracked.revisions = catalog.map(row => row.id);
    tracked.categories = (await fixture.owner.query("SELECT DISTINCT category_id AS id FROM public.category_entries WHERE revision_id=ANY($1::uuid[])", [tracked.revisions])).rows.map(row => row.id);
    tracked.products = (await fixture.owner.query("SELECT DISTINCT product_id AS id FROM public.product_entries WHERE revision_id=ANY($1::uuid[])", [tracked.revisions])).rows.map(row => row.id);
    assert.equal(Number((await fixture.owner.query("SELECT count(*) FROM public.categories")).rows[0].count), tracked.categories.length);
    assert.equal(Number((await fixture.owner.query("SELECT count(*) FROM public.products")).rows[0].count), tracked.products.length);
    await cleanupPublicFixture(fixture.owner, tracked);
    await verifyCmsProtection(fixture.owner, "tiny_osaka_test_owner");
    await assertEmptyTestDatabase(fixture.owner);
  } finally { await fixture.cleanup(); }
}
