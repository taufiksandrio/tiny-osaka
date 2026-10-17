import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsMedia } from "../../src/server/cms/media.mjs";
import { createCmsPages } from "../../src/server/cms/pages.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { cleanupPublicFixture, emptyTracking, assertEmptyTestDatabase } from "../fixtures/published-data.mjs";
import { createLocalStorage } from "../../src/server/media/storage.mjs";
import { fields } from "../fixtures/page-content.mjs";
import { verifyCmsProtection } from "../../scripts/lib/cms-protection.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
let fixture, pool, api, pages, jars, storage;
const tracked = emptyTracking(), files = [];
before(async () => {
  fixture = await createAuthFixture(); await assertEmptyTestDatabase(fixture.owner);
  pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  storage = createLocalStorage({ PUBLIC_DATABASE_TARGET: "test" });
  const context = { db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) };
  api = createCmsMedia({ ...context, storage: { ...storage, receive: async (...args) => { const result = await storage.receive(...args); files.push(result); return result; } } });
  pages = createCmsPages(context); jars = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar(); assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    jars.push(new Headers({ cookie: jar.header() }));
  }
});
after(async () => {
  await pool?.end();
  try { await cleanupPublicFixture(fixture.owner, tracked); await assertEmptyTestDatabase(fixture.owner); }
  finally { for (const file of files) await file.discard().catch(() => {}); await fixture?.cleanup(); }
});
const stream = bytes => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
const token = row => ({ revisionId: row.id, expectedVersion: row.version, expectedHash: row.contentHash });
let uploaded, bytes;
test("anonymous media reads and uploads fail before storage access", async () => {
  await assert.rejects(api.list(new Headers()), { code: "AUTH_REQUIRED" });
  await assert.rejects(api.upload(new Headers(), stream(Buffer.from("bad")), "image/png"), { code: "AUTH_REQUIRED" });
  assert.equal(files.length, 0);
});
test("Staff uploads original bytes without exposing keys/checksums or altering auth grants", async () => {
  bytes = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  uploaded = await api.upload(jars[1], stream(bytes), "image/png"); tracked.assets.push(uploaded.id);
  assert.equal(uploaded.width, 20); assert.equal(uploaded.mime, "image/png");
  assert.deepEqual((await api.file(jars[0], uploaded.id)).bytes, bytes);
  const list = await api.list(jars[1]); assert.equal(list.rows.length, 1);
  assert.ok(!JSON.stringify(list).includes("storageKey")); assert.ok(!JSON.stringify(list).includes("checksum"));
  assert.equal((await fixture.pool.query("SELECT public.public_read_media($1::uuid) AS content", [uploaded.id])).rows[0].content, null);
  await verifyCmsProtection(fixture.owner, "tiny_osaka_test_owner");
});
test("invalid decoding, forged inputs and unknown poster are rejected", async () => {
  await assert.rejects(api.upload(jars[1], stream(bytes), "image/jpeg"), { code: "INVALID_MEDIA" });
  await assert.rejects(api.upload(jars[1], stream(Buffer.from("bad")), "image/png"), { code: "INVALID_MEDIA" });
  await assert.rejects(api.youtube(jars[1], { videoId: "Abc_123-xyz", posterId: randomUUID(), role: "owner" }), { code: "INVALID_INPUT" });
  await assert.rejects(api.upload(jars[1], stream(bytes), "video/mp4", randomUUID()), { code: "NOT_FOUND" });
});
test("draft references increment versions, frozen edits fail and only exact publication grants bytes", async () => {
  const youtube = await api.youtube(jars[1], { videoId: "Abc_123-xyz", posterId: uploaded.id }); tracked.assets.push(youtube.id);
  let row = await pages.write(jars[1], "create", { pageKey: "about" }); tracked.pages.push("about"); tracked.pageRevisions.push(row.id);
  const data = { revisionId: row.id, expectedVersion: 1, assetId: youtube.id, referenceId: null, altId: "Gambar uji", altEn: "Test image", captionId: "", captionEn: "", sortOrder: 0 };
  const ref = await api.reference(jars[1], "page", "save", data); assert.equal(ref.version, 2);
  await assert.rejects(api.reference(jars[1], "page", "save", data), { code: "REVISION_CONFLICT" });
  let version = 2;
  for (const locale of ["id"]) row = await pages.write(jars[1], "save", { revisionId: row.id, expectedVersion: version++, locale, fields: fields() });
  row = await pages.write(jars[1], "submit", { revisionId: row.id, expectedVersion: row.version });
  await assert.rejects(api.reference(jars[0], "page", "remove", { revisionId: row.id, expectedVersion: row.version, referenceId: ref.id }), { code: "REVISION_CONFLICT" });
  await assert.rejects(pages.write(jars[1], "approve", token(row)), { code: "FORBIDDEN" });
  assert.equal((await fixture.pool.query("SELECT public.public_read_media($1::uuid) AS content", [uploaded.id])).rows[0].content, null);
  row = await pages.write(jars[0], "approve", token(row)); row = await pages.write(jars[0], "publish", token(row));
  assert.equal((await fixture.pool.query("SELECT public.public_read_media($1::uuid) AS content", [uploaded.id])).rows[0].content.id, uploaded.id);
  const clone = await pages.write(jars[1], "clone", { sourceRevisionId: row.id, expectedSourceVersion: row.version }); tracked.pageRevisions.push(clone.id);
  const refs = await api.references(jars[1], "page", clone.id);
  await api.reference(jars[1], "page", "remove", { revisionId: clone.id, expectedVersion: clone.version, referenceId: refs[0].id });
  assert.equal((await api.references(jars[1], "page", row.id)).length, 1);
  assert.equal((await fixture.pool.query("SELECT public.public_read_media($1::uuid) AS content", [uploaded.id])).rows[0].content.id, uploaded.id);
});
test("catalog picker scopes media to the exact product and audits save/remove without leaking storage metadata", async () => {
  const catalog = createCmsCatalog({ db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) });
  let graph = await catalog.write(jars[1], "create", {}); tracked.revisions.push(graph.revision.id);
  const base = () => ({ revisionId: graph.revision.id, expectedVersion: graph.revision.version });
  graph = await catalog.write(jars[1], "categoryCreate", { ...base(), slug: "qa-media-category-" + randomUUID(), sortOrder: 0 });
  tracked.categories.push(graph.categories[0].id);
  graph = await catalog.write(jars[1], "productCreate", { ...base(), slug: "qa-media-product-" + randomUUID(), categoryId: graph.categories[0].id, sortOrder: 0 });
  const productId = graph.products[0].id; tracked.products.push(productId);
  const input = { ...base(), productId, assetId: uploaded.id, referenceId: null, altId: "QA", altEn: "QA", captionId: "", captionEn: "", sortOrder: 0 };
  await assert.rejects(api.reference(jars[1], "catalog", "save", { ...input, productId: randomUUID() }), { code: "ENTRY_NOT_FOUND" });
  const ref = await api.reference(jars[1], "catalog", "save", input);
  const read = await catalog.read(jars[1], graph.revision.id);
  assert.equal(read.mediaAssets[0].width, uploaded.width); assert.equal(read.mediaAssets[0].storageKey, undefined);
  await api.reference(jars[1], "catalog", "remove", { revisionId: graph.revision.id, expectedVersion: ref.version, productId, referenceId: ref.id });
  assert.equal((await api.references(jars[1], "catalog", graph.revision.id, productId)).length, 0);
});
test("lost commit acknowledgement never deletes a possibly committed original", async () => {
  const lost = new Error("Synthetic lost commit acknowledgement");
  let received;
  const ambiguous = createCmsMedia({
    db: { transaction: async callback => { await drizzle(pool).transaction(callback); throw lost; } },
    authenticate: headers => fixture.service.authenticate(headers),
    storage: { ...storage, receive: async (...args) => { received = await storage.receive(...args); files.push(received); return received; } },
  });
  await assert.rejects(ambiguous.upload(jars[1], stream(bytes), "image/png"), error => error === lost);
  const row = (await fixture.owner.query("SELECT id FROM public.media_assets WHERE storage_key=$1", [received.report.storageKey])).rows[0];
  assert.ok(row); tracked.assets.push(row.id);
  assert.deepEqual(await storage.read(received.report), bytes);
});
