import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { authTablesWithMcp as authTables, verifyAuthProtection } from "../../scripts/lib/auth-protection.mjs";
import { getPublicDatabaseConfig } from "../../src/server/public/config.mjs";
import { provisionAccount } from "../../src/server/auth/provision.mjs";
import { createAuthService } from "../../src/server/auth/service.mjs";

export const createAuthFixture = async () => {
  const owner = await connectTestOwner();
  await owner.query("SELECT pg_advisory_lock(76210988)");
  for (const table of authTables) assert.equal(Number((await owner.query(`SELECT count(*) FROM cms_auth.${table}`)).rows[0].count), 0, table);
  const accounts = [], emails = [], password = "QA-only-" + randomBytes(24).toString("hex");
  const pool = new pg.Pool(getPublicDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  const env = { ...process.env, PUBLIC_DATABASE_TARGET: "test", BETTER_AUTH_URL: "http://127.0.0.1:3033", BETTER_AUTH_SECRET: randomBytes(48).toString("hex") };
  const service = createAuthService({ pool, env, sendEmail: async mail => emails.push(mail) });
  for (const role of ["owner", "staff"]) {
    const email = `qa-${role}-${randomUUID()}@example.invalid`;
    const account = await provisionAccount({ client: owner, email, password, role, name: "QA " + role });
    accounts.push({ ...account, email });
  }
  const expireLimits = async () => {
    const keys = (await owner.query("SELECT key FROM cms_auth.request_limits")).rows.map(row => row.key);
    await owner.query("UPDATE cms_auth.request_limits SET window_start=clock_timestamp()-interval '1 day' WHERE key=ANY($1::text[])", [keys]);
  };
  const cleanup = async () => {
    await pool.end();
    try {
      const auditIds = (await owner.query("SELECT id FROM cms_auth.audit")).rows.map(row => row.id);
      const limitKeys = (await owner.query("SELECT key FROM cms_auth.request_limits")).rows.map(row => row.key);
      await owner.query("BEGIN");
      await owner.query(`LOCK TABLE ${authTables.map(table => "cms_auth." + table).join(",")} IN ACCESS EXCLUSIVE MODE`);
      await owner.query("ALTER TABLE cms_auth.audit DISABLE TRIGGER USER");
      await owner.query("ALTER TABLE cms_auth.mcp_audit DISABLE TRIGGER USER");
      await owner.query("DELETE FROM cms_auth.mcp_audit");
      await owner.query("DELETE FROM cms_auth.oauth_clients");
      await owner.query("DELETE FROM cms_auth.audit WHERE id=ANY($1::uuid[])", [auditIds]);
      await owner.query("DELETE FROM cms_auth.request_limits WHERE key=ANY($1::text[])", [limitKeys]);
      await owner.query("DELETE FROM cms_auth.verifications WHERE value=ANY($1::text[]) OR identifier LIKE ANY($2::text[])",
        [accounts.map(account => account.id), accounts.map(account => "%" + account.id + "%")]);
      // Library verification values can contain challenge JSON, not just user IDs.
      const remaining = (await owner.query("SELECT id FROM cms_auth.verifications")).rows.map(row => row.id);
      await owner.query("DELETE FROM cms_auth.verifications WHERE id=ANY($1::text[])", [remaining]);
      await owner.query("DELETE FROM cms_auth.users WHERE id=ANY($1::text[])", [accounts.map(account => account.id)]);
      await owner.query("ALTER TABLE cms_auth.audit ENABLE TRIGGER USER");
      await owner.query("ALTER TABLE cms_auth.mcp_audit ENABLE TRIGGER USER");
      await verifyAuthProtection(owner, "tiny_osaka_test_owner", { mcp: true });
      await owner.query("COMMIT");
      for (const table of authTables) assert.equal(Number((await owner.query(`SELECT count(*) FROM cms_auth.${table}`)).rows[0].count), 0, table);
    } catch (error) { await owner.query("ROLLBACK"); throw error; }
    finally { await owner.end(); }
  };
  return { owner, pool, env, service, accounts, password, emails, expireLimits, cleanup };
};
export const cookieJar = () => {
  const cookies = new Map();
  return {
    header: () => [...cookies.entries()].map(([key, value]) => key + "=" + value).join("; "),
    accept: response => { for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0], index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    } },
  };
};
export const callAuth = async (fixture, path, body, jar, options = {}) => {
  const method = body === undefined ? "GET" : "POST";
  const headers = { "content-type": "application/json", origin: fixture.env.BETTER_AUTH_URL, ...options.headers };
  if (jar) headers.cookie = jar.header();
  const response = await fixture.service.handle(new Request(fixture.env.BETTER_AUTH_URL + "/api/auth" + path,
    { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  jar?.accept(response);
  return response;
};
