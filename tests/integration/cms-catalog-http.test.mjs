import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";

// AC-11: authentication, Origin/CSRF, RBAC and account-state checks for catalog create/update/delete.
// The CSRF control of this CMS is the exact Origin header plus Sec-Fetch-Site (there is no separate token),
// so "wrong/missing token" is covered by wrong/missing Origin and cross-site fetch metadata.
// Route-level requests below are all rejected or miss the card before any write; successful writes run in rolled-back transactions.
let fixture, pool, jars, cookies, catalogRoute, saved;
const ENV_KEYS = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "PUBLIC_DATABASE_TARGET"];
before(async () => {
  fixture = await createAuthFixture(); pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" })); jars = []; cookies = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar(); assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    jars.push(new Headers({ cookie: jar.header() })); cookies.push(jar.header());
  }
  // The route helper builds its auth service from process.env; point it at this fixture's secret (never printed).
  saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  Object.assign(process.env, { BETTER_AUTH_SECRET: fixture.env.BETTER_AUTH_SECRET, BETTER_AUTH_URL: fixture.env.BETTER_AUTH_URL, PUBLIC_DATABASE_TARGET: "test" });
  ({ catalogRoute } = await import("../../src/server/cms/catalog-http.mjs"));
});
after(async () => {
  await globalThis[Symbol.for("tiny-osaka.cms.pool")]?.end(); await globalThis[Symbol.for("tiny-osaka.auth.pool")]?.end();
  for (const key of ENV_KEYS) { if (saved?.[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  await pool?.end(); await fixture?.cleanup();
});
const rollback = new Error("rollback QA transaction");
const check = async callback => {
  try { await drizzle(pool).transaction(async tx => {
    await callback(createCmsCatalog({ db: tx, authenticate: headers => fixture.service.authenticate(headers) }), tx); throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
};
const [OWNER, STAFF] = [0, 1];
const input = (name, price = 25000) => ({ name, description: "", price });
const URL_BASE = "http://127.0.0.1:3033/api/cms/catalog";
// Same operations as src/app/api/cms/catalog/route.js and products/[slug]/route.js (minus cache revalidation).
const operations = {
  POST: request => catalogRoute(request, (api, body) => api.create(request.headers, body), { status: 201 }),
  PATCH: request => catalogRoute(request, (api, body) => api.update(request.headers, "qa-kartu", body)),
  DELETE: request => catalogRoute(request, api => api.remove(request.headers, "qa-kartu")),
};
const send = (method, { cookie, headers = {}, origin = fixture.env.BETTER_AUTH_URL } = {}) => {
  const init = { method, headers: { ...(origin === null ? {} : { origin }), ...(cookie ? { cookie } : {}), ...headers } };
  if (method !== "DELETE") { init.headers["content-type"] = "application/json"; init.body = JSON.stringify({ ...input("QA Kartu"), expectedVersion: "a".repeat(64) }); }
  return operations[method](new Request(method === "POST" ? URL_BASE : URL_BASE + "/products/qa-kartu", init));
};
const counts = async () => Object.fromEntries(await Promise.all(["catalog_revisions", "products", "catalog_deletion_log"].map(async table =>
  [table, Number((await fixture.owner.query(`SELECT count(*) FROM public.${table}`)).rows[0].count)])));

test("without a session create, update and delete answer 401 and write nothing", async () => {
  const before = await counts();
  for (const method of ["POST", "PATCH", "DELETE"]) {
    const response = await send(method);
    assert.equal(response.status, 401, method); assert.deepEqual(await response.json(), { code: "AUTH_REQUIRED" });
    assert.equal((await send(method, { origin: null })).status, 401, method + " without Origin still fails closed on authentication first");
    assert.equal((await send(method, { cookie: "better-auth.session_token=forged" })).status, 401, method + " forged cookie");
  }
  assert.deepEqual(await counts(), before);
});
test("a wrong, missing or opaque Origin is rejected for POST, PATCH and DELETE before any service call", async () => {
  const before = await counts();
  for (const method of ["POST", "PATCH", "DELETE"]) {
    for (const origin of [null, "http://evil.example", "http://127.0.0.1:3034", "https://127.0.0.1:3033", "null", fixture.env.BETTER_AUTH_URL + "/"]) {
      for (const role of [OWNER, STAFF]) {
        const response = await send(method, { cookie: cookies[role], origin });
        assert.equal(response.status, 403, `${method} ${origin} role ${role}`); assert.deepEqual(await response.json(), { code: "CSRF_REJECTED" });
      }
    }
  }
  assert.deepEqual(await counts(), before);
});
test("cross-site and same-site fetch metadata is rejected even with the correct Origin (no CSRF token exists)", async () => {
  const before = await counts();
  for (const method of ["POST", "PATCH", "DELETE"]) {
    for (const site of ["cross-site", "same-site", "bogus"]) {
      const response = await send(method, { cookie: cookies[OWNER], headers: { "sec-fetch-site": site } });
      assert.equal(response.status, 403, `${method} ${site}`); assert.deepEqual(await response.json(), { code: "CSRF_REJECTED" });
    }
  }
  assert.deepEqual(await counts(), before);
});
test("a correct Origin passes the CSRF gate and then RBAC decides (Staff delete 403, Owner only misses the absent card)", async () => {
  const before = await counts();
  for (const site of [undefined, "same-origin", "none"]) {
    const headers = site ? { "sec-fetch-site": site } : {};
    const staff = await send("DELETE", { cookie: cookies[STAFF], headers });
    assert.equal(staff.status, 403); assert.deepEqual(await staff.json(), { code: "FORBIDDEN" });
    const owner = await send("DELETE", { cookie: cookies[OWNER], headers });
    assert.equal(owner.status, 404); assert.deepEqual(await owner.json(), { code: "NOT_FOUND" });
    assert.equal((await send("PATCH", { cookie: cookies[STAFF], headers })).status, 404, "Staff may update; only the missing card stops it");
  }
  assert.deepEqual(await counts(), before);
});
test("Staff create and update succeed, Staff delete is 403 and leaves the product intact; Owner delete logs the Owner once", () => check(async (api, tx) => {
  const created = (await api.create(jars[STAFF], input("QA Hak Akses", 1000))).product;
  const updated = (await api.update(jars[STAFF], created.slug, { ...input("QA Hak Akses", 2000), expectedVersion: created.version })).product;
  assert.equal(updated.price, 2000);
  await assert.rejects(api.remove(jars[STAFF], created.slug), error => error.code === "FORBIDDEN" && error.status === 403);
  assert.deepEqual((await api.list(jars[STAFF])).products.map(row => row.slug), [created.slug]);
  assert.deepEqual(await api.remove(jars[OWNER], created.slug), { deleted: true, slug: "qa-hak-akses", name: "QA Hak Akses" });
  const log = (await tx.execute("SELECT actor_id, product_slug FROM public.catalog_deletion_log")).rows;
  assert.deepEqual(log, [{ actor_id: fixture.accounts[OWNER].id, product_slug: "qa-hak-akses" }]);
}));
test("a disabled account is denied on every mutation even with a previously valid session", async () => {
  const before = await counts();
  const subject = fixture.accounts[STAFF].id;
  await fixture.owner.query("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [subject]);
  try {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const response = await send(method, { cookie: cookies[STAFF] });
      assert.equal(response.status, 401, method); assert.deepEqual(await response.json(), { code: "AUTH_REQUIRED" });
    }
    await check(async api => {
      for (const run of [() => api.create(jars[STAFF], input("QA")), () => api.remove(jars[STAFF], "qa")]) await assert.rejects(run(), { code: "AUTH_REQUIRED" });
    });
  } finally { await fixture.owner.query("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [subject]); }
  assert.deepEqual(await counts(), before);
});
