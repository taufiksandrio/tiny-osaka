import test from "node:test";
import assert from "node:assert/strict";
import { readCmsInput, getCmsDatabaseConfig, exactInput } from "../../src/server/cms/request-policy.mjs";
const origin = "http://127.0.0.1:3033";
const request = (body, headers = {}) => new Request(origin, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body });
test("CMS rejects absent/foreign origins and cross-site requests", async () => {
  for (const headers of [{ origin: "https://evil.invalid" }, { origin: "null" }, { origin: "" }, { "sec-fetch-site": "cross-site" }]) {
    await assert.rejects(readCmsInput(request("{}", headers), origin), { code: "CSRF_REJECTED", status: 403 });
  }
});
test("CMS bounded JSON rejects arrays, null, invalid encoding and oversized streams", async () => {
  for (const body of ["[]", "null", "broken", '"text"']) await assert.rejects(readCmsInput(request(body), origin), { code: "INVALID_INPUT" });
  await assert.rejects(readCmsInput(request("{}", { "content-type": "text/plain" }), origin), { status: 415 });
  await assert.rejects(readCmsInput(request('"' + "x".repeat(80001) + '"'), origin), { status: 413 });
  await assert.rejects(readCmsInput(request(new Uint8Array([255])), origin), { code: "INVALID_INPUT" });
  assert.deepEqual(await readCmsInput(request('{"pageKey":"home"}'), origin), { pageKey: "home" });
});
test("CMS input rejects forged identity/role and unexpected fields", () => {
  assert.throws(() => exactInput({ pageKey: "home", role: "owner" }, ["pageKey"]), { code: "INVALID_INPUT" });
  assert.throws(() => exactInput({}, ["pageKey"]), { code: "INVALID_INPUT" });
});
test("CMS database config only permits dedicated loopback CMS credentials", () => {
  const url = "postgresql://tiny_osaka_test_cms:synthetic-secret@127.0.0.1:5432/tiny_osaka_test";
  const env = { PUBLIC_DATABASE_TARGET: "test", TEST_CMS_DATABASE_URL: url };
  assert.equal(getCmsDatabaseConfig(env).max, 2);
  for (const value of [url.replace("_cms:", "_migrator:"), url.replace("_cms:", "_app:"), url.replace("127.0.0.1", "example.invalid"), url + "?sslmode=require", url.replace("/tiny_osaka_test", "/tiny_osaka_dev")]) {
    assert.throws(() => getCmsDatabaseConfig({ ...env, TEST_CMS_DATABASE_URL: value }), { code: "CMS_UNAVAILABLE" });
  }
});
