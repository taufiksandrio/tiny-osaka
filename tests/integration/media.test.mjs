import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as s from "../../src/server/db/schema.mjs";
import * as c from "../../src/server/catalog/drafts.mjs";
import { createCatalogWorkflow } from "../../src/server/catalog/workflow.mjs";
import { getCatalogReviewReadiness } from "../../src/server/catalog/review.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";
import { createPageWorkflow } from "../../src/server/pages/workflow.mjs";
import { getPublishedPage } from "../../src/server/pages/published.mjs";
import { createMediaAssets } from "../../src/server/media/assets.mjs";
import { createMediaReferences, loadRevisionMedia } from "../../src/server/media/references.mjs";
import { MediaError } from "../../src/server/media/validation.mjs";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";
import { allTables } from "../../scripts/lib/test-migration-plan.mjs";
import { mediaTables, verifyMediaProtection } from "../../scripts/lib/media-protection.mjs";
import { verifyCatalogProtection } from "../../scripts/lib/catalog-protection.mjs";
import { verifyPageProtection } from "../../scripts/lib/page-protection.mjs";
import { fields } from "../fixtures/page-content.mjs";
import { imageAsset, inspectedImage } from "../fixtures/media.mjs";

const actor = async () => ({ subject: "qa-media-staff-subject", role: "staff" });
const owner = async () => ({ subject: "qa-media-owner-subject", role: "owner" });
const refs = db => createMediaReferences({ db, resolveActor: actor });
const pages = db => createPageWorkflow({ db, resolveActor: owner });
const catalog = db => createCatalogWorkflow({ db, resolveActor: owner });
const code = expected => error => error instanceof MediaError && error.code === expected;
const token = row => ({ revisionId: row.revisionId ?? row.id, expectedVersion: row.version, expectedHash: row.contentHash });
const root = async (db, id, domain = "page") => {
  const table = domain === "page" ? s.pageRevisions : s.catalogRevisions;
  return (await db.select().from(table).where(eq(table.id, id)))[0];
};
const text = { altId: "QA gambar atau video", altEn: "QA image or video", captionId: "", captionEn: "", sortOrder: 0 };
const rollback = new Error("rollback synthetic media fixture");
const withRollback = async run => {
  const client = await connectTestOwner();
  try {
    try { await drizzle(client).transaction(async tx => { await run(tx, client); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  } finally { await client.end(); }
};
// Synthetic inspection adapters exercise the trust contract, not real decoding.
const registerImage = async (db, changes = {}) => {
  const storageKey = randomUUID() + ".png";
  return createMediaAssets({ db, resolveActor: actor,
    inspectFile: async key => ({ ...inspectedImage(key), ...changes }) }).registerFile({ storageKey });
};
const registerVideo = async (db, posterId) => {
  const storageKey = randomUUID() + ".mp4";
  return createMediaAssets({ db, resolveActor: actor, inspectFile: async key => ({
    ...inspectedImage(key), mime: "video/mp4", byteSize: 100000000, width: 1920, height: 1080, durationMs: 120000,
  }) }).registerFile({ storageKey, posterId });
};
const completePage = async db => {
  const revision = await pages(db).createDraft({ pageKey: "about" });
  await pages(db).saveTranslation({ revisionId: revision.id, expectedVersion: 1, locale: "id", fields: fields() });
  await pages(db).saveTranslation({ revisionId: revision.id, expectedVersion: 2, locale: "en", fields: fields() });
  return root(db, revision.id);
};
const completeCatalog = async db => {
  const revision = await c.createCatalogDraft(db);
  let version = 1;
  const category = await c.createCatalogCategory(db, { revisionId: revision.id, expectedVersion: version++, slug: "qa-media-category-" + randomUUID(), sortOrder: 0 });
  const product = await c.createCatalogProduct(db, { revisionId: revision.id, expectedVersion: version++, slug: "qa-media-product-" + randomUUID(), sortOrder: 0, categoryId: category.categoryId });
  const variant = await c.createProductVariant(db, { revisionId: revision.id, expectedVersion: version++, productId: product.productId, code: "standard", basePrice: 250000, sortOrder: 0 });
  for (const locale of ["id", "en"]) {
    const t = { locale, title: "QA synthetic " + locale, description: "" };
    await c.saveCategoryTranslation(db, { revisionId: revision.id, categoryId: category.categoryId, expectedVersion: version++, ...t });
    await c.saveProductTranslation(db, { revisionId: revision.id, productId: product.productId, expectedVersion: version++, ...t });
    await c.saveVariantTranslation(db, { revisionId: revision.id, productId: product.productId, variantId: variant.variantId, expectedVersion: version++, ...t });
  }
  return { revision: await root(db, revision.id, "catalog"), categoryId: category.categoryId, productId: product.productId };
};
const publish = async (api, revision) => api.publish(token(await api.approve(token(await api.submit(token(revision))))));
const rejectSql = async (db, client, statement, params = [], expected = "23514") => {
  await assert.rejects(db.transaction(() => client.query(statement, params)),
    error => error.code === expected || error.cause?.code === expected);
};

test("registration requires trusted inspection and records only verified immutable metadata plus audit", () => withRollback(async db => {
  const storageKey = randomUUID() + ".png";
  const api = createMediaAssets({ db, resolveActor: actor });
  await assert.rejects(api.registerFile({ storageKey, verified: true, mime: "image/png", byteSize: 1 }), code("INSPECTION_REQUIRED"));
  assert.equal((await db.select().from(s.mediaAssets)).length, 0);
  const image = await registerImage(db, { byteSize: 10000000, width: 4096, height: 4096 });
  assert.equal(image.byteSize, 10000000); assert.equal(image.width, 4096);
  const events = await db.select().from(s.mediaEvents);
  assert.equal(events.length, 1); assert.equal(events[0].actorId, "qa-media-staff-subject");
  assert.equal(events[0].assetId, image.id);
  await assert.rejects(registerImage(db, { byteSize: 10000001 }), code("INVALID_MEDIA"));
  assert.equal((await db.select().from(s.mediaAssets)).length, 1);
}));

test("stored video and YouTube require a registered image poster; arbitrary iframe/URL is rejected", () => withRollback(async db => {
  const poster = await registerImage(db), video = await registerVideo(db, poster.id);
  assert.equal(video.durationMs, 120000); assert.equal(video.posterId, poster.id);
  const api = createMediaAssets({ db, resolveActor: actor });
  const youtube = await api.registerYoutube({ videoId: "Abc_123-xyz", posterId: poster.id });
  assert.equal(youtube.kind, "youtube"); assert.equal(youtube.storageKey, null);
  await assert.rejects(api.registerYoutube({ videoId: "https://youtube.com/watch?v=Abc_123-xyz", posterId: poster.id }), code("INVALID_INPUT"));
  await assert.rejects(api.registerYoutube({ videoId: "Abc_123-xyz", posterId: video.id }), code("INVALID_POSTER"));
  await assert.rejects(registerVideo(db, randomUUID()), code("INVALID_POSTER"));
  assert.equal((await db.select().from(s.mediaAssets)).length, 3);
}));

test("SQL checks reject invalid metadata, unsupported types and non-image posters", () => withRollback(async (db, client) => {
  const poster = await registerImage(db), video = await registerVideo(db, poster.id);
  for (const changes of [{ byteSize: 10000001 }, { width: 4097 }, { checksum: null }, { mime: "image/svg+xml" },
    { byteSize: null }, { storageKey: "../forged.png" }]) {
    const asset = imageAsset(changes);
    await assert.rejects(db.transaction(tx => tx.insert(s.mediaAssets).values(asset)),
      error => error.code === "23514" || error.cause?.code === "23514");
  }
  await rejectSql(db, client, "INSERT INTO media_assets(kind,external_id,poster_id) VALUES ('youtube','Abc_123-xyz',$1)", [video.id]);
  await rejectSql(db, client, "INSERT INTO media_assets(kind,external_id,poster_id) VALUES ('youtube','https://example.com',$1)", [poster.id]);
}));

test("asset metadata and registration audits cannot be modified or deleted even while unreferenced", () => withRollback(async (db, client) => {
  const asset = await registerImage(db);
  for (const statement of [
    "UPDATE media_assets SET checksum=repeat('b',64) WHERE id=$1", "DELETE FROM media_assets WHERE id=$1",
    "UPDATE media_events SET action=action WHERE asset_id=$1", "DELETE FROM media_events WHERE asset_id=$1",
  ]) await rejectSql(db, client, statement, [asset.id]);
}));

test("page reference create/update/remove consumes one exact draft version and preserves bilingual text", () => withRollback(async db => {
  const revision = await completePage(db), asset = await registerImage(db);
  const ref = await refs(db).savePage({ ...token(revision), assetId: asset.id, ...text });
  assert.equal(ref.version, 4);
  const changed = await refs(db).savePage({ revisionId: revision.id, expectedVersion: 4, referenceId: ref.id, assetId: asset.id,
    ...text, altEn: "QA changed image", captionId: "<script>literal</script>", sortOrder: 5 });
  assert.equal(changed.version, 5); assert.equal(changed.altEn, "QA changed image");
  await assert.rejects(refs(db).savePage({ ...token(revision), assetId: asset.id, ...text }), code("REVISION_CONFLICT"));
  const removed = await refs(db).removePage({ revisionId: revision.id, expectedVersion: 5, referenceId: ref.id });
  assert.equal(removed.version, 6);
  assert.equal((await loadRevisionMedia(db, revision.id, "page")).mediaRefs.length, 0);
}));

test("catalog media requires exact revision/product scope and refuses cross-scope references", () => withRollback(async db => {
  const a = await completeCatalog(db), b = await completeCatalog(db), asset = await registerImage(db);
  const ref = await refs(db).saveCatalog({ ...token(a.revision), productId: a.productId, assetId: asset.id, ...text });
  assert.equal(ref.version, a.revision.version + 1);
  await assert.rejects(refs(db).saveCatalog({ revisionId: b.revision.id, expectedVersion: b.revision.version,
    productId: a.productId, assetId: asset.id, ...text }), code("ENTRY_NOT_FOUND"));
  await assert.rejects(refs(db).removeCatalog({ revisionId: b.revision.id, expectedVersion: b.revision.version,
    productId: b.productId, referenceId: ref.id }), code("REFERENCE_NOT_FOUND"));
  assert.equal((await root(db, b.revision.id, "catalog")).version, b.revision.version);
}));

test("references cap at twelve in both writer and raw SQL without version loss on failure", () => withRollback(async (db, client) => {
  const page = await completePage(db), cat = await completeCatalog(db), asset = await registerImage(db);
  for (const domain of ["page", "catalog"]) {
    const revision = domain === "page" ? page : cat.revision;
    const method = domain === "page" ? "savePage" : "saveCatalog";
    let version = revision.version;
    for (let i = 0; i < 12; i++) {
      const result = await refs(db)[method]({ revisionId: revision.id, expectedVersion: version++, assetId: asset.id,
        ...(domain === "catalog" ? { productId: cat.productId } : {}), ...text, sortOrder: i });
      assert.equal(result.version, version);
    }
    await assert.rejects(refs(db)[method]({ revisionId: revision.id, expectedVersion: version, assetId: asset.id,
      ...(domain === "catalog" ? { productId: cat.productId } : {}), ...text }), code("MEDIA_LIMIT"));
    if (domain === "page") await rejectSql(db, client, "INSERT INTO page_media_refs(revision_id,asset_id) VALUES ($1,$2)", [revision.id, asset.id]);
    else await rejectSql(db, client, "INSERT INTO catalog_media_refs(revision_id,product_id,asset_id) VALUES ($1,$2,$3)", [revision.id, cat.productId, asset.id]);
    assert.equal((await root(db, revision.id, domain)).version, version);
  }
}));

test("partial media labels may be drafted but both locales are required before submitting", () => withRollback(async db => {
  const page = await completePage(db), cat = await completeCatalog(db), asset = await registerImage(db);
  const p = await refs(db).savePage({ ...token(page), assetId: asset.id, ...text, altId: "" });
  await assert.rejects(pages(db).submit({ revisionId: page.id, expectedVersion: p.version }), error => error.code === "NOT_READY");
  const c = await refs(db).saveCatalog({ ...token(cat.revision), productId: cat.productId, assetId: asset.id, ...text, altId: "" });
  const readiness = await getCatalogReviewReadiness(db, { revisionId: cat.revision.id, expectedVersion: c.version });
  assert.equal(readiness.ready, false); assert.ok(readiness.issues.some(row => row.code === "INVALID_MEDIA_GRAPH"));
  await assert.rejects(catalog(db).submit({ revisionId: cat.revision.id, expectedVersion: c.version }), error => error.code === "NOT_READY");
}));

test("catalog approval freezes media; clone edits stay isolated and published DTO omits private metadata", () => withRollback(async (db, client) => {
  const fixture = await completeCatalog(db), poster = await registerImage(db), video = await registerVideo(db, poster.id);
  const saved = await refs(db).saveCatalog({ ...token(fixture.revision), productId: fixture.productId, assetId: video.id, ...text });
  const live = await publish(catalog(db), { id: fixture.revision.id, version: saved.version });
  const dto = await getPublishedCatalog(db);
  assert.equal(dto.media.length, 1); assert.equal(dto.media[0].asset.kind, "video"); assert.equal(dto.media[0].poster.kind, "image");
  for (const key of ["mediaAssets", "mediaRefs", "storageKey", "checksum", "qa-media-owner-subject"]) assert.ok(!JSON.stringify(dto).includes(key));
  for (const statement of [
    "UPDATE catalog_media_refs SET alt_id='forged' WHERE revision_id=$1",
    "DELETE FROM catalog_media_refs WHERE revision_id=$1",
    "INSERT INTO catalog_media_refs SELECT * FROM catalog_media_refs WHERE revision_id=$1",
  ]) await rejectSql(db, client, statement, [fixture.revision.id]);
  const clone = await c.cloneCatalogDraft(db, { sourceRevisionId: fixture.revision.id, expectedSourceVersion: saved.version });
  const graph = await loadRevisionMedia(db, clone.id, "catalog");
  assert.equal(graph.mediaRefs[0].id, saved.id); assert.equal(graph.mediaAssets.length, 2);
  await refs(db).saveCatalog({ revisionId: clone.id, expectedVersion: 1, referenceId: saved.id, productId: fixture.productId,
    assetId: video.id, ...text, altId: "QA replacement" });
  assert.equal((await getPublishedCatalog(db)).media[0].altId, text.altId);
  const next = await catalog(db).submit({ revisionId: clone.id, expectedVersion: 2 });
  assert.notEqual(next.contentHash, live.contentHash);
}));

test("page media is approved with content and replaces live media only on explicit publication", () => withRollback(async (db, client) => {
  const revision = await completePage(db), first = await registerImage(db), second = await registerImage(db);
  const saved = await refs(db).savePage({ ...token(revision), assetId: first.id, ...text });
  const live = await publish(pages(db), { id: revision.id, version: saved.version });
  for (const statement of [
    "UPDATE page_media_refs SET asset_id=asset_id WHERE revision_id=$1", "DELETE FROM page_media_refs WHERE revision_id=$1",
    "INSERT INTO page_media_refs SELECT * FROM page_media_refs WHERE revision_id=$1",
  ]) await rejectSql(db, client, statement, [revision.id]);
  const clone = await pages(db).cloneDraft({ sourceRevisionId: revision.id, expectedSourceVersion: saved.version });
  const changed = await refs(db).savePage({ revisionId: clone.id, expectedVersion: 1, referenceId: saved.id, assetId: second.id,
    ...text, altId: "QA pengganti", altEn: "QA replacement" });
  const next = await pages(db).submit({ revisionId: clone.id, expectedVersion: changed.version });
  await assert.rejects(pages(db).approve({ ...token(next), expectedHash: live.contentHash }), error => error.code === "HASH_CONFLICT");
  const approval = await pages(db).approve(token(next));
  assert.equal((await getPublishedPage(db, { pageKey: "about", locale: "id" })).media[0].asset.id, first.id);
  await pages(db).publish(token(approval));
  for (const locale of ["id"]) {
    const dto = await getPublishedPage(db, { pageKey: "about", locale });
    assert.equal(dto.media[0].asset.id, second.id);
    assert.equal(dto.media[0].alt, locale === "id" ? "QA pengganti" : "QA replacement");
    assert.ok(!JSON.stringify(dto).includes("storageKey")); assert.ok(!JSON.stringify(dto).includes("checksum"));
  }
}));

test("raw reference reparenting and updates to frozen assets/posters are denied", () => withRollback(async (db, client) => {
  const a = await completePage(db), b = await completePage(db), asset = await registerImage(db);
  const ref = await refs(db).savePage({ ...token(a), assetId: asset.id, ...text });
  await rejectSql(db, client, "UPDATE page_media_refs SET revision_id=$1 WHERE revision_id=$2", [b.id, a.id]);
  await rejectSql(db, client, "UPDATE page_media_refs SET id=$1 WHERE id=$2", [randomUUID(), ref.id]);
  await publish(pages(db), { id: a.id, version: ref.version });
  await rejectSql(db, client, "UPDATE media_assets SET width=width WHERE id=$1", [asset.id]);
  await rejectSql(db, client, "DELETE FROM media_assets WHERE id=$1", [asset.id]);
}));

test("registration and reference create/update/remove roll back real SQL failures after writes", () => withRollback(async db => {
  const broken = { transaction: callback => db.transaction(async tx => {
    const result = await callback(tx); await tx.execute(sql`SELECT 1/0`); return result;
  }) };
  await assert.rejects(registerImage(broken), code("PERSISTENCE_FAILED"));
  assert.equal((await db.select().from(s.mediaAssets)).length, 0);
  assert.equal((await db.select().from(s.mediaEvents)).length, 0);
  const page = await completePage(db), cat = await completeCatalog(db), asset = await registerImage(db);
  for (const domain of ["page", "catalog"]) {
    const revision = domain === "page" ? page : cat.revision;
    const save = domain === "page" ? "savePage" : "saveCatalog", remove = domain === "page" ? "removePage" : "removeCatalog";
    const scope = { revisionId: revision.id, expectedVersion: revision.version, ...(domain === "catalog" ? { productId: cat.productId } : {}) };
    await assert.rejects(refs(broken)[save]({ ...scope, assetId: asset.id, ...text }), code("PERSISTENCE_FAILED"));
    assert.equal((await root(db, revision.id, domain)).version, revision.version);
    const ref = await refs(db)[save]({ ...scope, assetId: asset.id, ...text });
    for (const operation of [() => refs(broken)[save]({ ...scope, expectedVersion: ref.version, referenceId: ref.id,
      assetId: asset.id, ...text, altId: "QA losing change" }),
    () => refs(broken)[remove]({ ...scope, expectedVersion: ref.version, referenceId: ref.id })]) {
      await assert.rejects(operation(), code("PERSISTENCE_FAILED"));
      assert.equal((await root(db, revision.id, domain)).version, ref.version);
      assert.equal((await loadRevisionMedia(db, revision.id, domain)).mediaRefs[0].altId, text.altId);
    }
  }
}));

test("runtime grants stay closed and missing identity blocks media registration and reference writes", async () => {
  const client = new pg.Client(getDatabaseConfig(process.env, "test"));
  try {
    await client.connect();
    for (const table of mediaTables) assert.equal((await client.query(
      "SELECT has_table_privilege(session_user,$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed",
      ["public." + table])).rows[0].allowed, false);
    await assert.rejects(createMediaAssets({ db: drizzle(client) }).registerFile({ storageKey: randomUUID() + ".png" }), code("AUTH_REQUIRED"));
    for (const method of Object.values(createMediaReferences({ db: drizzle(client) }))) await assert.rejects(method({ role: "owner" }), code("AUTH_REQUIRED"));
  } finally { await client.end(); }
});

const blocked = async (client, pids) => {
  for (let i = 0; i < 80; i++) {
    const { rows: [row] } = await client.query("SELECT count(*)::integer AS total FROM unnest($1::integer[]) AS w(pid) WHERE cardinality(pg_blocking_pids(w.pid))>0", [pids]);
    if (row.total === pids.length) return;
    await delay(25);
  }
  assert.fail("Workers must reach actual database lock contention.");
};
// Test-only maintenance under exclusive locks. Never a runtime bypass.
const cleanup = async (client, tracked) => {
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, "tiny_osaka_test");
  await client.query("BEGIN");
  try {
    await client.query("LOCK TABLE " + allTables.map(table => "public." + table).join(",") + " IN ACCESS EXCLUSIVE MODE");
    for (const table of allTables) await client.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
    for (const table of ["page_media_refs", "page_publications", "page_workflow_events", "page_approvals", "page_submissions", "page_translations"]) {
      await client.query(`DELETE FROM ${table} WHERE revision_id=ANY($1::uuid[])`, [tracked.revisions]);
    }
    await client.query("DELETE FROM page_revisions WHERE id=ANY($1::uuid[])", [tracked.revisions]);
    await client.query("DELETE FROM pages p WHERE key=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM page_revisions r WHERE r.page_key=p.key)", [tracked.keys]);
    await client.query("DELETE FROM media_events WHERE asset_id=ANY($1::uuid[])", [tracked.assets]);
    for (const id of [...tracked.assets].reverse()) await client.query("DELETE FROM media_assets WHERE id=$1", [id]);
    for (const table of allTables) await client.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
    await verifyCatalogProtection(client, "tiny_osaka_test_owner");
    await verifyPageProtection(client, "tiny_osaka_test_owner");
    await verifyMediaProtection(client, "tiny_osaka_test_owner");
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    throw new Error("Inspect only owned media fixture IDs: " + JSON.stringify(tracked));
  }
};

test("media attachment versus text edit and submit serialize with one exact-version winner", async () => {
  const client = await connectTestOwner(), a = await connectTestOwner(), b = await connectTestOwner();
  const tracked = { revisions: [], keys: [], assets: [] }; let pending = [];
  try {
    const fixture = await drizzle(client).transaction(async tx => {
      await tx.execute(sql`LOCK TABLE pages IN SHARE ROW EXCLUSIVE MODE`);
      const [existing] = await tx.select().from(s.pages).where(eq(s.pages.key, "about"));
      const page = await completePage(tx), asset = await registerImage(tx);
      tracked.revisions.push(page.id); tracked.assets.push(asset.id); if (!existing) tracked.keys.push("about");
      return { page, asset };
    });
    const pids = [(await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid, (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid];
    for (const submit of [false, true]) {
      const current = await root(drizzle(client), fixture.page.id);
      await client.query("BEGIN"); await client.query("SELECT id FROM page_revisions WHERE id=$1 FOR UPDATE", [current.id]);
      pending = [
        refs(drizzle(a)).savePage({ ...token(current), assetId: fixture.asset.id, ...text }),
        submit ? pages(drizzle(b)).submit(token(current)) : pages(drizzle(b)).saveTranslation({ ...token(current), locale: "en", fields: fields() }),
      ].map(promise => promise.then(value => ({ value }), error => ({ error })));
      await blocked(client, pids); await client.query("ROLLBACK");
      const results = await Promise.all(pending); pending = [];
      assert.equal(results.filter(r => r.value).length, 1);
      assert.equal(results.filter(r => r.error?.code === "REVISION_CONFLICT").length, 1);
    }
  } finally {
    await client.query("ROLLBACK"); await Promise.all(pending); await a.end(); await b.end();
    try { await cleanup(client, tracked); } finally { await client.end(); }
  }
});

test("two raw inserts at eleven references cannot bypass the database twelve-media cap", async () => {
  const client = await connectTestOwner(), a = await connectTestOwner(), b = await connectTestOwner();
  const tracked = { revisions: [], keys: [], assets: [] }; let pending = [];
  try {
    const fixture = await drizzle(client).transaction(async tx => {
      await tx.execute(sql`LOCK TABLE pages IN SHARE ROW EXCLUSIVE MODE`);
      const [existing] = await tx.select().from(s.pages).where(eq(s.pages.key, "about"));
      const page = await completePage(tx), asset = await registerImage(tx);
      tracked.revisions.push(page.id); tracked.assets.push(asset.id); if (!existing) tracked.keys.push("about");
      for (let i = 0; i < 11; i++) await refs(tx).savePage({ revisionId: page.id, expectedVersion: page.version + i, assetId: asset.id, ...text });
      return { page, asset };
    });
    const pids = [(await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid, (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid];
    await client.query("BEGIN"); await client.query("SELECT id FROM page_revisions WHERE id=$1 FOR UPDATE", [fixture.page.id]);
    pending = [a, b].map(worker => worker.query("INSERT INTO page_media_refs(revision_id,asset_id,alt_id,alt_en) VALUES ($1,$2,'QA id','QA en')",
      [fixture.page.id, fixture.asset.id]).then(value => ({ value }), error => ({ error })));
    await blocked(client, pids); await client.query("ROLLBACK");
    const results = await Promise.all(pending); pending = [];
    assert.equal(results.filter(r => r.value).length, 1);
    assert.equal(results.filter(r => r.error?.code === "23514").length, 1);
    assert.equal((await loadRevisionMedia(drizzle(client), fixture.page.id, "page")).mediaRefs.length, 12);
  } finally {
    await client.query("ROLLBACK"); await Promise.all(pending); await a.end(); await b.end();
    try { await cleanup(client, tracked); } finally { await client.end(); }
  }
});

test("all thirty tables are empty and guard definitions, ownership and fourteen history entries remain intact", async () => {
  const client = await connectTestOwner();
  try {
    for (const table of allTables) assert.equal((await client.query(`SELECT count(*)::integer AS total FROM ${table}`)).rows[0].total, 0);
    await verifyCatalogProtection(client, "tiny_osaka_test_owner");
    await verifyPageProtection(client, "tiny_osaka_test_owner");
    await verifyMediaProtection(client, "tiny_osaka_test_owner");
    assert.equal(Number((await client.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count), 15);
  } finally { await client.end(); }
});

