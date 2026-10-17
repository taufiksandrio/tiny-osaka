import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsMedia } from "../../src/server/cms/media.mjs";
import { createPageWorkflow } from "../../src/server/pages/workflow.mjs";
import * as drafts from "../../src/server/catalog/drafts.mjs";
import { loadRevisionMedia } from "../../src/server/media/references.mjs";
import { assetDto } from "../../src/server/cms/media.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { cleanupPublicFixture, emptyTracking, assertEmptyTestDatabase } from "../fixtures/published-data.mjs";
import { createLocalStorage } from "../../src/server/media/storage.mjs";
import { fields } from "../fixtures/page-content.mjs";
import { verifyCmsProtection } from "../../scripts/lib/cms-protection.mjs";
let fixture, pool, api, jars, storage;
const tracked = emptyTracking(), files = [];
before(async () => {
  fixture = await createAuthFixture(); await assertEmptyTestDatabase(fixture.owner);
  pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  storage = createLocalStorage({ PUBLIC_DATABASE_TARGET: "test" });
  const context = { db: drizzle(pool), authenticate: headers => fixture.service.authenticate(headers) };
  api = createCmsMedia({ ...context, storage: { ...storage, receive: async (...args) => { const result = await storage.receive(...args); files.push(result); return result; } } });
  jars = [];
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
const token = row => ({ revisionId: row.revisionId, expectedVersion: row.version, expectedHash: row.contentHash });
// Revision-based CMS routes were removed (ADR-037); drive the same domain workflow directly.
const pageFlow = index => createPageWorkflow({ db: drizzle(pool),
  resolveActor: async () => ({ subject: fixture.accounts[index].id, role: index === 0 ? "owner" : "staff" }) });
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
  const row = await pageFlow(1).createDraft({ pageKey: "about" }); tracked.pages.push("about"); tracked.pageRevisions.push(row.id);
  const data = { revisionId: row.id, expectedVersion: 1, assetId: youtube.id, referenceId: null, altId: "Gambar uji", altEn: "Test image", captionId: "", captionEn: "", sortOrder: 0 };
  const ref = await api.reference(jars[1], "page", "save", data); assert.equal(ref.version, 2);
  await assert.rejects(api.reference(jars[1], "page", "save", data), { code: "REVISION_CONFLICT" });
  let version = 2;
  version = (await pageFlow(1).saveTranslation({ revisionId: row.id, expectedVersion: version, locale: "id", fields: fields() })).version;
  const submitted = await pageFlow(1).submit({ revisionId: row.id, expectedVersion: version });
  await assert.rejects(api.reference(jars[0], "page", "remove", { revisionId: row.id, expectedVersion: submitted.version, referenceId: ref.id }), { code: "REVISION_CONFLICT" });
  await assert.rejects(pageFlow(1).approve(token(submitted)), { code: "FORBIDDEN" });
  assert.equal((await fixture.pool.query("SELECT public.public_read_media($1::uuid) AS content", [uploaded.id])).rows[0].content, null);
  const approved = await pageFlow(0).approve(token(submitted)); const published = await pageFlow(0).publish(token(approved));
  assert.equal((await fixture.pool.query("SELECT public.public_read_media($1::uuid) AS content", [uploaded.id])).rows[0].content.id, uploaded.id);
  const clone = await pageFlow(1).cloneDraft({ sourceRevisionId: row.id, expectedSourceVersion: published.version }); tracked.pageRevisions.push(clone.id);
  const refs = await api.references(jars[1], "page", clone.id);
  await api.reference(jars[1], "page", "remove", { revisionId: clone.id, expectedVersion: clone.version, referenceId: refs[0].id });
  assert.equal((await api.references(jars[1], "page", row.id)).length, 1);
  assert.equal((await fixture.pool.query("SELECT public.public_read_media($1::uuid) AS content", [uploaded.id])).rows[0].content.id, uploaded.id);
});
test("catalog picker scopes media to the exact product and audits save/remove without leaking storage metadata", async () => {
  const db = drizzle(pool);
  const draft = await drafts.createCatalogDraft(db); tracked.revisions.push(draft.id);
  const category = await drafts.createCatalogCategory(db, { revisionId: draft.id, expectedVersion: draft.version, slug: "qa-media-category-" + randomUUID(), sortOrder: 0 });
  tracked.categories.push(category.categoryId);
  const product = await drafts.createCatalogProduct(db, { revisionId: draft.id, expectedVersion: category.version, slug: "qa-media-product-" + randomUUID(), categoryId: category.categoryId, sortOrder: 0 });
  const productId = product.productId; tracked.products.push(productId);
  const input = { revisionId: draft.id, expectedVersion: product.version, productId, assetId: uploaded.id, referenceId: null, altId: "QA", altEn: "QA", captionId: "", captionEn: "", sortOrder: 0 };
  await assert.rejects(api.reference(jars[1], "catalog", "save", { ...input, productId: randomUUID() }), { code: "ENTRY_NOT_FOUND" });
  const ref = await api.reference(jars[1], "catalog", "save", input);
  const media = await loadRevisionMedia(db, draft.id, "catalog"); const dto = assetDto(media.mediaAssets[0]);
  assert.equal(dto.width, uploaded.width); assert.equal(dto.storageKey, undefined);
  await api.reference(jars[1], "catalog", "remove", { revisionId: draft.id, expectedVersion: ref.version, productId, referenceId: ref.id });
  assert.equal((await api.references(jars[1], "catalog", draft.id, productId)).length, 0);
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
