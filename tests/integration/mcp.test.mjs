import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import sharp from "sharp";
import * as s from "../../src/server/db/schema.mjs";
import { imageAsset, inspectedImage } from "../fixtures/media.mjs";
import { buildMcp } from "../../src/server/mcp/compose.mjs";
import { challengeFor, hashSecret } from "../../src/server/mcp/tokens.mjs";
import { createCmsPages } from "../../src/server/cms/pages.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { createCmsMedia } from "../../src/server/cms/media.mjs";
import { createMediaAssets } from "../../src/server/media/assets.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";
import { getPublishedCatalog } from "../../src/server/catalog/published.mjs";
import { getPublishedPage } from "../../src/server/pages/published.mjs";
import { toolNames } from "../../src/server/mcp/tools.mjs";
import { MediaError } from "../../src/server/media/validation.mjs";
import { hasUploadsTable } from "../../scripts/lib/auth-protection.mjs";

// MCP Owner end to end against the local test database: real OAuth rows (cleaned by the fixture) and CMS writes inside
// a rolled-back transaction. Requires migration 0018 (npm run db:migrate:test).
let fixture, cmsPool, mcp, base, owner, staff, ownerJar, staffJar, currentDb = null, refreshes = 0, clock = 0;
// Q-5: stand-in for the file storage only (set per upload test); uploadsReady is false until migration 0019 is applied.
let storageOverride = null, storageFailure = null, uploadsReady = false;
const fields = { title: "QA simpan lewat MCP", body: { blocks: [{ type: "paragraph", content: [{ text: "QA konten Indonesia" }] }] } };
const redirectUri = "http://127.0.0.1:41234/callback";
const baseNow = () => new Date(Date.now() + clock);
before(async () => {
  fixture = await createAuthFixture();
  cmsPool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  [owner, staff] = fixture.accounts; base = fixture.env.BETTER_AUTH_URL;
  mcp = buildMcp({ pool: fixture.pool, consume: fixture.service.consume, baseURL: base, now: baseNow,
    authenticateSession: headers => fixture.service.authenticate(headers),
    cmsFor: actor => {
      assert.ok(currentDb, "CMS access outside a rolled-back transaction");
      const context = { db: currentDb, authenticate: async () => ({ subject: actor.subject, role: actor.role }) };
      return { pages: createCmsPages(context), catalog: createCmsCatalog(context), media: createCmsMedia({ ...context, storage: storageOverride ?? undefined }) };
    },
    refreshPublic: () => { refreshes++; } });
  uploadsReady = await hasUploadsTable(fixture.owner);
  ownerJar = cookieJar(); staffJar = cookieJar();
  assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password: fixture.password }, ownerJar)).status, 200);
  assert.equal((await callAuth(fixture, "/sign-in/email", { email: staff.email, password: fixture.password }, staffJar)).status, 200);
});
after(async () => { await cmsPool?.end(); await fixture?.cleanup(); });
beforeEach(async () => { clock = 0; refreshes = 0; await fixture.expireLimits(); });

const rollback = new Error("rollback QA transaction");
const inTransaction = async callback => {
  try { await drizzle(cmsPool).transaction(async tx => { currentDb = tx; await callback(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; } finally { currentDb = null; }
};

const newClient = (name = "QA MCP client", uris = [redirectUri]) => mcp.clients.create({ createdBy: owner.id, input: { name, redirectUris: uris } });
const pkce = () => { const verifier = randomBytes(48).toString("base64url"); return { verifier, challenge: challengeFor(verifier) }; };
const authorizeBody = (client, challenge, extra = {}) => ({ client_id: client.clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256",
  state: "st-" + randomUUID(), resource: base + "/api/mcp", decision: "approve", ...extra });
const postAuthorize = (body, jar = ownerJar, headers = {}) => mcp.oauth.authorizePost(new Request(base + "/api/mcp/oauth/authorize", { method: "POST",
  headers: { "content-type": "application/json", origin: base, cookie: jar?.header() ?? "", ...headers }, body: JSON.stringify(body) }));
const codeFrom = async response => { assert.equal(response.status, 200); const { redirectTo } = await response.json(); return new URL(redirectTo).searchParams; };
const tokenRequest = form => mcp.oauth.token(new Request(base + "/api/mcp/oauth/token", { method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }));
const exchange = (client, params, verifier, extra = {}) => tokenRequest({ grant_type: "authorization_code", client_id: client.clientId, code: params.get("code"),
  redirect_uri: redirectUri, code_verifier: verifier, ...extra });
const login = async (options = {}) => {
  const client = options.client ?? await newClient();
  const { verifier, challenge } = pkce();
  const params = await codeFrom(await postAuthorize(authorizeBody(client, challenge, options.extra)));
  const response = await exchange(client, params, verifier);
  assert.equal(response.status, 200);
  return { client, tokens: await response.json(), params, verifier };
};
const refreshRequest = (client, refresh, extra = {}) => tokenRequest({ grant_type: "refresh_token", client_id: client.clientId, refresh_token: refresh, ...extra });
const rpc = async (token, method, params, headers = {}, id = 1) => mcp.server.handle(new Request(base + "/api/mcp", { method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: "Bearer " + token } : {}), ...headers },
  body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) }));
const call = async (token, name, args) => {
  const response = await rpc(token, "tools/call", { name, arguments: args });
  assert.equal(response.status, 200);
  const { result } = await response.json();
  const body = JSON.parse(result.content[0].text);
  return result.isError ? { error: body } : { ok: body };
};
const audits = async (event, clientId) => (await fixture.owner.query("SELECT * FROM cms_auth.mcp_audit WHERE ($1::text IS NULL OR event=$1) AND ($2::text IS NULL OR client_id=$2) ORDER BY at", [event ?? null, clientId ?? null])).rows;
const asOwner = async (sql, values) => fixture.owner.query(sql, values);

test("all 14 tools work end to end through authorize -> code -> token -> tools/call, with the real Owner as actor and cache invalidation", async () => {
  const { tokens } = await login();
  assert.equal(tokens.token_type, "Bearer"); assert.equal(tokens.expires_in, 900); assert.equal(tokens.scope, "mcp:read mcp:write");
  assert.match(tokens.access_token, /^tomcp_at_/); assert.match(tokens.refresh_token, /^tomcp_rt_/);
  const listed = await (await rpc(tokens.access_token, "tools/list")).json();
  assert.deepEqual(listed.result.tools.map(item => item.name).sort(), [...toolNames].sort());
  await inTransaction(async tx => {
    const token = tokens.access_token;
    assert.deepEqual((await call(token, "menu_list", {})).ok.products, []);
    const created = (await call(token, "menu_create", { name: "QA MCP Takoyaki", description: "Uji", price: 25000 })).ok.product;
    assert.equal(created.slug, "qa-mcp-takoyaki"); assert.equal(created.price, 25000); assert.equal(refreshes, 1);
    assert.deepEqual((await getPublishedCatalog(tx)).products.map(row => row.slug), ["qa-mcp-takoyaki"], "saved = live");
    // Image + alt through an asset that exists in the library.
    const asset = await createMediaAssets({ db: tx, resolveActor: async () => ({ subject: owner.id, role: "owner" }), inspectFile: async key => inspectedImage(key) })
      .registerFile({ storageKey: randomUUID() + ".png", posterId: null });
    const withImage = (await call(token, "menu_create", { name: "QA MCP Okonomiyaki", price: 30000, imageAssetId: asset.id, imageAlt: "Foto uji" })).ok.product;
    assert.equal(withImage.image.alt, "Foto uji");
    assert.equal((await call(token, "menu_create", { name: "QA Gambar", price: 1, imageAlt: "Alt tanpa gambar" })).error.code, "IMAGE_REQUIRED");
    assert.equal(refreshes, 2, "a failed write does not refresh");
    // Update: stale version is a 409-equivalent and writes nothing.
    const updated = (await call(token, "menu_update", { slug: created.slug, expectedVersion: created.version, name: "QA MCP Takoyaki", price: 27000 })).ok.product;
    assert.equal(updated.price, 27000); assert.equal(refreshes, 3);
    const stale = await call(token, "menu_update", { slug: created.slug, expectedVersion: created.version, name: "QA Lama", price: 1 });
    assert.deepEqual([stale.error.code, stale.error.status], ["PRODUCT_CONFLICT", 409]); assert.equal(refreshes, 3);
    assert.equal((await call(token, "menu_list", {})).ok.products.find(row => row.slug === created.slug).price, 27000);
    // Q-1 regression: price-only update keeps name, description, image and alt; no field at all is rejected; "" clears.
    const priceOnly = (await call(token, "menu_update", { slug: withImage.slug, price: 31000 })).ok.product;
    assert.deepEqual([priceOnly.name, priceOnly.price, priceOnly.image], [withImage.name, 31000, withImage.image]);
    const kept = (await call(token, "menu_update", { slug: created.slug, price: 28000 })).ok.product;
    assert.deepEqual([kept.name, kept.description, kept.price], ["QA MCP Takoyaki", "Uji", 28000]);
    assert.equal((await call(token, "menu_update", { slug: created.slug })).error.code, "INVALID_INPUT");
    assert.equal((await call(token, "menu_update", { slug: created.slug, description: "" })).ok.product.description, "");
    assert.equal((await call(token, "menu_update", { slug: created.slug, description: "Uji", price: 27000 })).ok.product.price, 27000);
    await fixture.expireLimits();
    assert.equal((await call(token, "menu_create", { name: "QA", price: 1.5 })).error.code, "INVALID_PRICE");
    assert.equal((await call(token, "menu_create", { name: "QA", price: 1, grabfoodUrl: "https://grab.example" })).error.code, "INVALID_INPUT");
    // Delete needs the exact name; a wrong, empty or missing name deletes nothing.
    for (const confirmName of ["qa mcp takoyaki", "", "QA MCP", "QA MCP Takoyaki "]) {
      const refused = await call(token, "menu_delete", { slug: created.slug, confirmName });
      assert.deepEqual([refused.error.code, refused.error.status], ["CONFIRM_NAME_MISMATCH", 400]);
    }
    assert.equal((await call(token, "menu_delete", { slug: created.slug })).error.code, "CONFIRM_NAME_MISMATCH");
    assert.equal((await call(token, "menu_delete", { slug: "tidak-ada", confirmName: "x" })).error.code, "NOT_FOUND");
    assert.equal((await tx.execute("SELECT 1 FROM public.catalog_deletion_log")).rows.length, 0);
    assert.equal(refreshes, 7, "refused deletes do not refresh");
    assert.deepEqual((await call(token, "menu_delete", { slug: created.slug, confirmName: "QA MCP Takoyaki" })).ok, { success: true, slug: created.slug });
    assert.equal(refreshes, 8);
    assert.equal((await tx.execute("SELECT 1 FROM public.catalog_deletion_log")).rows.length, 1);
    assert.ok(!(await call(token, "menu_list", {})).ok.products.some(row => row.slug === created.slug), "permanently gone");

    await fixture.expireLimits(); // keep the per-minute write budget out of the way of the page and media steps
    // Pages.
    const pages = (await call(token, "page_list", {})).ok;
    assert.ok(pages.some(row => row.pageKey === "about" && row.publishedRevisionId === null));
    assert.equal((await call(token, "page_get", { pageKey: "nope" })).error.code, "NOT_FOUND");
    const empty = (await call(token, "page_get", { pageKey: "about" })).ok;
    assert.deepEqual([empty.id, empty.version], [null, 0]);
    const saved = (await call(token, "page_save", { pageKey: "about", expectedRevisionId: empty.id, expectedVersion: empty.version, fields, mediaOperations: [] })).ok;
    assert.ok(saved.id); assert.equal(refreshes, 9);
    assert.equal((await getPublishedPage(tx, { pageKey: "about" })).fields.title, fields.title);
    const conflict = await call(token, "page_save", { pageKey: "about", expectedRevisionId: empty.id, expectedVersion: empty.version, fields, mediaOperations: [] });
    assert.deepEqual([conflict.error.code, conflict.error.status], ["REVISION_CONFLICT", 409]); assert.equal(refreshes, 9);
    assert.equal((await call(token, "page_get", { pageKey: "about" })).ok.id, saved.id);
    assert.equal((await call(token, "page_save", { pageKey: "about", expectedRevisionId: saved.id, expectedVersion: saved.version, fields, mediaOperations: [], extra: 1 })).error.code, "INVALID_INPUT");

    // Media: metadata only; YouTube registration needs an image poster.
    const listedMedia = (await call(token, "media_list", {})).ok;
    assert.ok(listedMedia.rows.some(row => row.id === asset.id));
    const meta = (await call(token, "media_get", { id: asset.id })).ok;
    assert.equal(meta.id, asset.id); assert.ok(!JSON.stringify(meta).includes("storageKey") && !JSON.stringify(meta).includes(".png") && !("bytes" in meta));
    assert.equal((await call(token, "media_get", { id: randomUUID() })).error.code, "NOT_FOUND");
    const youtube = (await call(token, "media_register_youtube", { videoId: "Abc_123-xyz", posterId: asset.id })).ok;
    assert.equal(youtube.kind, "youtube"); assert.equal(youtube.posterId, asset.id); assert.equal(refreshes, 10);
    assert.equal((await call(token, "media_register_youtube", { videoId: "Abc_123-xyz", posterId: randomUUID() })).error.code, "INVALID_POSTER");

    // Workflow actors are the real Owner, never a service account.
    const actors = (await tx.execute("SELECT DISTINCT actor_id FROM public.catalog_workflow_events UNION SELECT DISTINCT actor_id FROM public.page_workflow_events")).rows.map(row => row.actor_id);
    assert.deepEqual(actors, [owner.id]);
    const receipts = (await tx.execute("SELECT DISTINCT approved_by FROM public.catalog_approvals UNION SELECT DISTINCT approved_by FROM public.page_approvals")).rows.map(row => row.approved_by);
    assert.deepEqual(receipts, [owner.id]);
  });
});

// ---- Q-7 (AC-42..45): createdAt + thumbnails on media_list / media_get. Storage is a stand-in that serves real image bytes. ----
const callRaw = async (token, name, args) => {
  const response = await rpc(token, "tools/call", { name, arguments: args });
  assert.equal(response.status, 200);
  return { result: (await response.json()).result };
};
test("Q-7 AC-42..45: createdAt, thumbnails for images only, list limit and order, failure keeps metadata, no storage key leaks", async () => {
  const { tokens } = await login();
  const png = await sharp({ create: { width: 1400, height: 900, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
  let failReads = false, reads = 0;
  storageOverride = { read: async () => { reads++; if (failReads) throw new Error("/secret/volume/path.png"); return png; } };
  try {
    await inTransaction(async tx => {
      const token = tokens.access_token, soon = Date.now() + 3600000, keys = [];
      const images = [];
      for (let i = 0; i < 15; i++) {
        const row = imageAsset({ createdAt: new Date(soon + i * 60000), byteSize: png.length });
        keys.push(row.storageKey); images.push((await tx.insert(s.mediaAssets).values(row).returning())[0]);
      }
      const [video] = await tx.insert(s.mediaAssets).values({ kind: "youtube", externalId: "Abc_123-xyz", posterId: images[0].id, createdAt: new Date(soon + 20 * 60000) }).returning();
      const dump = raw => JSON.stringify(raw);
      // media_get on an image: JSON metadata first, then one image content block; nothing sensitive in either.
      const got = (await callRaw(token, "media_get", { id: images[3].id })).result;
      assert.ok(!got.isError); assert.equal(got.content.length, 2); assert.equal(got.content[0].type, "text"); assert.equal(got.content[1].type, "image");
      const meta = JSON.parse(got.content[0].text);
      assert.equal(meta.id, images[3].id); assert.equal(meta.createdAt, images[3].createdAt.toISOString()); assert.ok(!("storageKey" in meta));
      const thumb = Buffer.from(got.content[1].data, "base64"), info = await sharp(thumb).metadata();
      assert.ok(["webp", "jpeg"].includes(info.format) && got.content[1].mimeType === "image/" + info.format);
      assert.ok(Math.max(info.width, info.height) <= 512 && thumb.length < 60 * 1024, `thumb ${info.width}x${info.height} ${thumb.length}`);
      for (const key of keys) assert.ok(!dump(got).includes(key) && !got.content[0].text.includes(key.split(".")[0]));
      assert.ok(!got.content[1].data.includes("iVBOR") || thumb.length < png.length, "not the original bytes");
      // Video/YouTube: metadata only.
      const vid = (await callRaw(token, "media_get", { id: video.id })).result;
      assert.equal(vid.content.length, 1); assert.equal(JSON.parse(vid.content[0].text).kind, "youtube");
      const readsBefore = reads;
      // Thumbnail failure never fails the metadata, and the error detail goes nowhere.
      failReads = true;
      const original = console.error, logged = []; console.error = (...args) => logged.push(args.join(" "));
      let failed; try { failed = (await callRaw(token, "media_get", { id: images[3].id })).result; } finally { console.error = original; }
      failReads = false;
      assert.ok(!failed.isError); assert.equal(failed.content.length, 1); assert.equal(JSON.parse(failed.content[0].text).id, images[3].id);
      assert.ok(!dump(failed).includes("secret") && !logged.join("").includes("secret"), "no path or detail in output or log");
      assert.ok(reads > readsBefore);
      // media_list: newest first with createdAt; default = no thumbnails and no byte reads.
      reads = 0;
      const plain = (await callRaw(token, "media_list", {})).result;
      assert.equal(plain.content.length, 1); assert.equal(reads, 0);
      const list = JSON.parse(plain.content[0].text);
      assert.equal(list.rows[0].id, video.id); assert.deepEqual(list.rows.slice(1, 16).map(row => row.id), images.map(row => row.id).reverse());
      const times = list.rows.map(row => Date.parse(row.createdAt)); assert.ok(times.every((time, i) => i === 0 || time <= times[i - 1]), "newest first");
      assert.ok(list.rows.every(row => /^\d{4}-\d\d-\d\dT.*Z$/.test(row.createdAt) && !("storageKey" in row)) && !("thumbnailIds" in list));
      // thumbnails:true: only the first 12 images (the YouTube row on top gets none), list order, images after the JSON.
      const rich = (await callRaw(token, "media_list", { thumbnails: true })).result;
      const richList = JSON.parse(rich.content[0].text);
      assert.deepEqual(richList.thumbnailIds, images.map(row => row.id).reverse().slice(0, 12));
      assert.equal(rich.content.length, 13); assert.ok(rich.content.slice(1).every(block => block.type === "image" && block.data.length > 0));
      assert.ok(!dump(rich).includes(keys[0]) && keys.every(key => !dump(rich).includes(key)));
      // Every read failing: the list is still complete, just without images.
      failReads = true;
      console.error = () => {};
      let allFailed; try { allFailed = (await callRaw(token, "media_list", { thumbnails: true })).result; } finally { console.error = original; failReads = false; }
      assert.ok(!allFailed.isError); assert.equal(allFailed.content.length, 1); assert.deepEqual(JSON.parse(allFailed.content[0].text).thumbnailIds, []);
      assert.equal(JSON.parse(allFailed.content[0].text).rows.length, 16);
      assert.equal((await call(token, "media_list", { thumbnails: "yes" })).error.code, "INVALID_INPUT");
    });
  } finally { storageOverride = null; }
});

test("Q-2/Q-3: menu alt defaults, page_update merge, auto expected revision, media alt, no-op, version-0 page, page_save alias", async () => {
  const { tokens } = await login();
  await inTransaction(async tx => {
    const token = tokens.access_token;
    const asset = await createMediaAssets({ db: tx, resolveActor: async () => ({ subject: owner.id, role: "owner" }), inspectFile: async key => inspectedImage(key) })
      .registerFile({ storageKey: randomUUID() + ".png", posterId: null });
    // AC-7/8: only name + price; slug automatic with collision suffix; alt = name unless explicit.
    const first = (await call(token, "menu_create", { name: "QA Roti Bakar", price: 8000 })).ok.product;
    assert.deepEqual([first.slug, first.price, first.image], ["qa-roti-bakar", 8000, null]);
    const second = (await call(token, "menu_create", { name: "QA Roti Bakar", price: 9000, imageAssetId: asset.id })).ok.product;
    assert.deepEqual([second.slug, second.image.alt], ["qa-roti-bakar-2", "QA Roti Bakar"]);
    const explicit = (await call(token, "menu_create", { name: "QA Roti Manis", price: 7000, imageAssetId: asset.id, imageAlt: "Roti manis" })).ok.product;
    assert.equal(explicit.image.alt, "Roti manis");
    assert.equal((await call(token, "menu_create", { price: 1 })).error.code, "INVALID_NAME");
    assert.equal((await call(token, "menu_create", { name: "QA", price: 1, imageAlt: "x" })).error.code, "IMAGE_REQUIRED");
    // menu_update: alt = merged name when an image is set without alt; optional/stale expectedVersion; unknown slug.
    const renamed = (await call(token, "menu_update", { slug: first.slug, name: "QA Roti Panggang", imageAssetId: asset.id })).ok.product;
    assert.deepEqual([renamed.name, renamed.image.alt], ["QA Roti Panggang", "QA Roti Panggang"]);
    assert.equal((await call(token, "menu_update", { slug: first.slug })).error.code, "INVALID_INPUT");
    assert.equal((await call(token, "menu_update", { slug: first.slug, price: 1, expectedVersion: first.version })).error.code, "PRODUCT_CONFLICT");
    assert.equal((await call(token, "menu_update", { slug: "tidak-ada", price: 1 })).error.code, "NOT_FOUND");
    await fixture.expireLimits();

    // AC-16: a never-created page is filled with no page_get first.
    const created = (await call(token, "page_update", { pageKey: "about", fields })).ok;
    assert.ok(created.id); assert.equal((await getPublishedPage(tx, { pageKey: "about" })).fields.title, fields.title);
    // AC-12: partial merge keeps the other keys; AC-13: expected values are automatic.
    const merged = (await call(token, "page_update", { pageKey: "about", fields: { summary: "Ringkasan uji" } })).ok;
    assert.deepEqual([merged.fields.title, merged.fields.summary, merged.fields.body], [fields.title, "Ringkasan uji", fields.body]);
    assert.notEqual(merged.id, created.id);
    // No change: no new revision.
    const count = async () => (await tx.execute("SELECT count(*)::int AS n FROM public.page_revisions WHERE page_key='about'")).rows[0].n;
    const before = await count();
    const same = (await call(token, "page_update", { pageKey: "about", fields: { summary: "Ringkasan uji" } })).ok;
    assert.equal(same.id, merged.id); assert.equal(await count(), before);
    // AC-14: key outside the template.
    const bad = await call(token, "page_update", { pageKey: "about", fields: { nope: "x" } });
    assert.deepEqual([bad.error.code, bad.error.status], ["INVALID_CONTENT", 400]);
    assert.equal((await call(token, "page_update", { pageKey: "tidak-ada", fields })).error.code, "NOT_FOUND");
    // AC-15: media with alt defaulting to the page title; empty title is INVALID_INPUT.
    const withMedia = (await call(token, "page_update", { pageKey: "about", mediaOperations: [{ action: "mediaSave", data: { assetId: asset.id } }] })).ok;
    assert.deepEqual([withMedia.mediaRefs.length, withMedia.mediaRefs[0].altId], [1, fields.title]);
    const removed = (await call(token, "page_update", { pageKey: "about", mediaOperations: [{ action: "mediaRemove", data: { referenceId: withMedia.mediaRefs[0].id } }] })).ok;
    assert.equal(removed.mediaRefs.length, 0);
    const noTitle = await call(token, "page_update", { pageKey: "home", fields: { summary: "x" }, mediaOperations: [{ action: "mediaSave", data: { assetId: asset.id } }] });
    assert.equal(noTitle.error.code, "INVALID_INPUT");
    // AC-17: page_save alias still works; stale expected values conflict.
    const latest = (await call(token, "page_get", { pageKey: "about" })).ok;
    const aliased = (await call(token, "page_save", { pageKey: "about", expectedRevisionId: latest.id, expectedVersion: latest.version, fields: { ...latest.fields, summary: "Alias" }, mediaOperations: [] })).ok;
    assert.equal(aliased.fields.summary, "Alias");
    const stale = await call(token, "page_save", { pageKey: "about", expectedRevisionId: latest.id, expectedVersion: latest.version, fields, mediaOperations: [] });
    assert.deepEqual([stale.error.code, stale.error.status], ["REVISION_CONFLICT", 409]);
  });
});

test("audit: one row per OAuth and tool event, only identifiers (no tokens, codes, verifiers or field content); runtime cannot read, edit or delete it", async () => {
  const { tokens, params, verifier, client } = await login();
  await inTransaction(async () => {
    await call(tokens.access_token, "menu_create", { name: "Rahasia Konten Uji", description: "Isi rahasia", price: 5 });
    await call(tokens.access_token, "menu_create", { name: "Rahasia", price: -5 });
    await call(tokens.access_token, "menu_list", {});
  });
  const rows = await audits(null, client.clientId);
  const events = rows.map(row => row.event);
  for (const event of ["code_issued", "authorize_approved", "token_issued", "tool_call"]) assert.ok(events.includes(event), event);
  assert.equal(rows.filter(row => row.event === "tool_call").length, 3);
  const toolRows = rows.filter(row => row.event === "tool_call");
  assert.deepEqual(toolRows.map(row => [row.tool, row.outcome, row.code]), [["menu_create", "ok", null], ["menu_create", "denied", "INVALID_PRICE"], ["menu_list", "ok", null]]);
  assert.equal(toolRows[0].target, "rahasia-konten-uji"); assert.ok(toolRows.every(row => row.user_id === owner.id && row.client_id === client.clientId && row.request_id));
  const dump = JSON.stringify(rows);
  for (const secret of [tokens.access_token, tokens.refresh_token, params.get("code"), verifier, "Isi rahasia", "Rahasia Konten Uji", fixture.password]) assert.ok(!dump.includes(secret), "secret leaked into audit");
  // Hashes only in token tables.
  const stored = (await asOwner("SELECT token_hash FROM cms_auth.oauth_tokens WHERE client_id=$1", [client.clientId])).rows.map(row => row.token_hash);
  assert.deepEqual(stored.sort(), [hashSecret(tokens.access_token), hashSecret(tokens.refresh_token)].sort());
  assert.ok(!JSON.stringify(stored).includes(tokens.access_token));
  assert.equal((await asOwner("SELECT code_hash FROM cms_auth.oauth_codes WHERE code_hash=$1", [hashSecret(params.get("code"))])).rows.length, 1);
  assert.equal((await asOwner("SELECT 1 FROM cms_auth.oauth_codes WHERE code_hash=$1", [params.get("code")])).rows.length, 0);
  // Privilege boundary: auth role appends only; the CMS role has nothing on any MCP table.
  const denied = query => assert.rejects(fixture.pool.query(query), error => error.code === "42501");
  await denied("SELECT * FROM cms_auth.mcp_audit"); await denied("UPDATE cms_auth.mcp_audit SET outcome='ok'"); await denied("DELETE FROM cms_auth.mcp_audit");
  await denied("TRUNCATE cms_auth.mcp_audit"); await denied("UPDATE cms_auth.oauth_clients SET name='x'"); await denied("UPDATE cms_auth.oauth_tokens SET scope='x'");
  await denied("UPDATE cms_auth.oauth_codes SET resource='x'");
  await assert.rejects(fixture.owner.query("UPDATE cms_auth.mcp_audit SET outcome='ok'"), error => error.code === "23514", "append-only trigger, even for the owner role");
  for (const table of ["oauth_clients", "oauth_codes", "oauth_tokens", "mcp_audit"]) {
    await assert.rejects(cmsPool.query(`SELECT 1 FROM cms_auth.${table}`), error => error.code === "42501", table);
    await assert.rejects(cmsPool.query(`DELETE FROM cms_auth.${table}`), error => error.code === "42501", table);
  }
  await assert.rejects(fixture.pool.query("INSERT INTO cms_auth.oauth_clients(client_id,name,redirect_uris,created_by,auth_method) VALUES ('x','x',ARRAY['https://a.example/'],$1,'client_secret_basic')", [owner.id]), error => error.code === "42501");
  await assert.rejects(asOwner("INSERT INTO cms_auth.oauth_clients(client_id,name,redirect_uris,created_by,auth_method) VALUES ('x','x',ARRAY['https://a.example/'],$1,'client_secret_basic')", [owner.id]), error => error.code === "23514");
});

test("authorize: only an Owner session approves; Staff, anonymous, cross-origin and malformed requests issue no code", async () => {
  const client = await newClient(); const { challenge } = pkce();
  const codes = async () => Number((await asOwner("SELECT count(*) FROM cms_auth.oauth_codes WHERE client_id=$1", [client.clientId])).rows[0].count);
  const staffDenied = await postAuthorize(authorizeBody(client, challenge), staffJar);
  assert.equal(staffDenied.status, 403); assert.equal((await staffDenied.json()).error, "access_denied");
  assert.equal((await postAuthorize(authorizeBody(client, challenge), null)).status, 401);
  assert.equal((await postAuthorize(authorizeBody(client, challenge), ownerJar, { origin: "https://evil.example" })).status, 403);
  assert.equal((await postAuthorize(authorizeBody(client, challenge), ownerJar, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await mcp.oauth.authorizePost(new Request(base + "/api/mcp/oauth/authorize", { method: "POST", headers: { origin: base, cookie: ownerJar.header(), "content-type": "text/plain" }, body: "x" }))).status, 415);
  assert.equal((await postAuthorize({ ...authorizeBody(client, challenge), decision: "maybe" })).status, 400);
  assert.equal((await postAuthorize({ ...authorizeBody(client, challenge), extra: "x" })).status, 400);
  assert.equal(await codes(), 0);
  assert.ok((await audits("authorize_rejected")).some(row => row.user_id === staff.id && row.outcome === "denied"));
  // Owner can deny: access_denied goes back to the client with state, and no code exists.
  const state = "keep-me";
  const denied = await postAuthorize(authorizeBody(client, challenge, { decision: "deny", state }));
  const target = new URL((await denied.json()).redirectTo);
  assert.equal(target.origin + target.pathname, redirectUri); assert.equal(target.searchParams.get("error"), "access_denied"); assert.equal(target.searchParams.get("state"), state);
  assert.equal(await codes(), 0);
  const approved = await codeFrom(await postAuthorize(authorizeBody(client, challenge, { state })));
  assert.equal(approved.get("state"), state); assert.equal(await codes(), 1);
  const row = (await asOwner("SELECT * FROM cms_auth.oauth_codes WHERE client_id=$1", [client.clientId])).rows[0];
  assert.equal(row.challenge_method, "S256"); assert.equal(row.user_id, owner.id); assert.ok(row.expires_at.getTime() - row.created_at.getTime() <= 60000);
});

test("authorize GET: invalid client or redirect never redirects; PKCE/response errors go to the trusted redirect; valid requests go to the consent page", async () => {
  const client = await newClient(); const { challenge } = pkce();
  const get = params => mcp.oauth.authorizeGet(new Request(base + "/api/mcp/oauth/authorize?" + new URLSearchParams(params)));
  const good = { response_type: "code", client_id: client.clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256", state: "s1" };
  const ok = await get(good);
  assert.equal(ok.status, 302);
  const location = new URL(ok.headers.get("location"));
  assert.equal(location.origin + location.pathname, base + "/admin/mcp/authorize"); assert.equal(location.searchParams.get("client_id"), client.clientId);
  assert.equal(location.searchParams.get("scope"), "mcp:read mcp:write"); assert.equal(location.searchParams.get("resource"), base + "/api/mcp");
  for (const bad of [{ ...good, client_id: "mcpc_unknown" }, { ...good, redirect_uri: "https://evil.example/cb" }, { ...good, redirect_uri: redirectUri + "/x" }, { ...good, client_id: undefined }]) {
    const response = await get(Object.fromEntries(Object.entries(bad).filter(([, value]) => value !== undefined)));
    assert.equal(response.status, 400, JSON.stringify(bad)); assert.equal(response.headers.get("location"), null);
  }
  for (const [bad, error] of [[{ ...good, code_challenge: undefined }, "invalid_request"], [{ ...good, code_challenge_method: "plain" }, "invalid_request"], [{ ...good, code_challenge: "short" }, "invalid_request"],
    [{ ...good, response_type: "token" }, "unsupported_response_type"], [{ ...good, scope: "admin" }, "invalid_scope"], [{ ...good, resource: "https://other.example/api/mcp" }, "invalid_target"]]) {
    const response = await get(Object.fromEntries(Object.entries(bad).filter(([, value]) => value !== undefined)));
    assert.equal(response.status, 302); const target = new URL(response.headers.get("location"));
    assert.equal(target.origin + target.pathname, redirectUri); assert.equal(target.searchParams.get("error"), error); assert.equal(target.searchParams.get("state"), "s1");
  }
  assert.equal((await get({ ...good, client_id: [client.clientId, client.clientId].join("&client_id=") })).status, 400);
  const duplicate = await mcp.oauth.authorizeGet(new Request(base + "/api/mcp/oauth/authorize?" + new URLSearchParams(good) + "&state=again"));
  assert.equal(duplicate.status, 400);
  // The consent page helper shows the client and scopes, and refuses an unknown client.
  const described = await mcp.oauth.describe(Object.fromEntries(location.searchParams));
  assert.equal(described.clientName, client.name); assert.deepEqual(described.scope, ["mcp:read", "mcp:write"]); assert.equal(described.form.code_challenge_method, "S256");
  await assert.rejects(mcp.oauth.describe({ ...good, client_id: "mcpc_unknown" }), error => error.error === "invalid_request");
});

test("token endpoint: replay, wrong verifier, wrong redirect_uri, expired code, disabled client and foreign client all fail with invalid_grant/client", async () => {
  const client = await newClient(); const other = await newClient("Klien lain");
  const authorize = async () => { const { verifier, challenge } = pkce(); return { verifier, params: await codeFrom(await postAuthorize(authorizeBody(client, challenge))) }; };
  // Replay revokes what the first exchange produced (AC-5).
  let { verifier, params } = await authorize();
  const first = await (await exchange(client, params, verifier)).json();
  assert.equal((await rpc(first.access_token, "tools/list")).status, 200, "token works before replay");
  const replay = await exchange(client, params, verifier);
  assert.equal(replay.status, 400); assert.equal((await replay.json()).error, "invalid_grant");
  assert.equal((await rpc(first.access_token, "tools/list")).status, 401, "access token revoked by replay");
  assert.equal((await refreshRequest(client, first.refresh_token)).status, 400, "refresh token revoked by replay");
  assert.ok((await audits("code_replay")).length >= 1);
  // Wrong verifier burns the code.
  ({ verifier, params } = await authorize());
  assert.equal((await (await exchange(client, params, pkce().verifier)).json()).error, "invalid_grant");
  assert.equal((await exchange(client, params, verifier)).status, 400, "the code is consumed even after a failed attempt");
  // Wrong redirect_uri.
  ({ verifier, params } = await authorize());
  assert.equal((await exchange(client, params, verifier, { redirect_uri: "http://127.0.0.1:41234/other" })).status, 400);
  // Wrong or missing resource, missing verifier.
  ({ verifier, params } = await authorize());
  assert.equal((await exchange(client, params, verifier, { resource: "https://other.example/api/mcp" })).status, 400);
  ({ verifier, params } = await authorize());
  assert.equal((await exchange(client, params, undefined)).status, 400);
  // Expired code (clock pushed past the 60 s limit on the stored row).
  ({ verifier, params } = await authorize());
  await asOwner("UPDATE cms_auth.oauth_codes SET expires_at=clock_timestamp()-interval '1 second' WHERE code_hash=$1", [hashSecret(params.get("code"))]);
  assert.equal((await (await exchange(client, params, verifier)).json()).error, "invalid_grant");
  // Another client cannot redeem the code.
  ({ verifier, params } = await authorize());
  assert.equal((await (await exchange(other, params, verifier)).json()).error, "invalid_grant");
  // Disabled client: no exchange, no refresh.
  ({ verifier, params } = await authorize());
  await mcp.clients.disable(client.clientId);
  const disabled = await exchange(client, params, verifier);
  assert.equal(disabled.status, 401); assert.equal((await disabled.json()).error, "invalid_client");
  assert.equal((await tokenRequest({ grant_type: "password", client_id: other.clientId, username: "a", password: "b" })).status, 400);
  assert.equal((await tokenRequest({ grant_type: "client_credentials", client_id: other.clientId })).status, 400);
  assert.equal((await tokenRequest({ client_id: other.clientId })).status, 400);
  assert.equal((await mcp.oauth.token(new Request(base + "/api/mcp/oauth/token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }))).status, 415);
});

test("refresh tokens rotate; reusing a rotated token revokes the whole family and is audited; the response carries no-store", async () => {
  const { client, tokens } = await login();
  const rotated = await refreshRequest(client, tokens.refresh_token);
  assert.equal(rotated.status, 200); assert.equal(rotated.headers.get("cache-control"), "no-store");
  const next = await rotated.json();
  assert.notEqual(next.access_token, tokens.access_token); assert.notEqual(next.refresh_token, tokens.refresh_token);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401, "previous access token retired with the rotation");
  assert.equal((await rpc(next.access_token, "tools/list")).status, 200);
  const reuse = await refreshRequest(client, tokens.refresh_token);
  assert.equal(reuse.status, 400); assert.equal((await reuse.json()).error, "invalid_grant");
  assert.equal((await rpc(next.access_token, "tools/list")).status, 401, "family revoked");
  assert.equal((await refreshRequest(client, next.refresh_token)).status, 400);
  assert.ok((await audits("reuse_detected")).some(row => row.client_id === client.clientId && row.user_id === owner.id));
  assert.ok((await audits("token_refreshed")).length >= 1);
  // A refresh token cannot be used with another client, nor widened in scope.
  const second = await login(); const stranger = await newClient("Asing");
  assert.equal((await refreshRequest(stranger, second.tokens.refresh_token)).status, 400);
  const narrowed = await refreshRequest(second.client, second.tokens.refresh_token, { scope: "mcp:read" });
  assert.equal(narrowed.status, 200); const narrow = await narrowed.json(); assert.equal(narrow.scope, "mcp:read");
  assert.equal((await refreshRequest(second.client, narrow.refresh_token, { scope: "mcp:read mcp:write" })).status, 400, "no scope widening");
});

test("controlled clock: access ends at 15 minutes, refresh idles out at 1 hour, the family ends at 24 hours", async () => {
  let { client, tokens } = await login();
  clock = 14 * 60000; assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200);
  clock = 15 * 60000 + 1000; assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
  clock = 61 * 60000; assert.equal((await refreshRequest(client, tokens.refresh_token)).status, 400, "idle for more than 1 hour");
  clock = 0; ({ client, tokens } = await login());
  let rotations = 0, at = 0;
  while (rotations < 60) {
    at += 50 * 60000; clock = at;
    await fixture.expireLimits(); // 28 refreshes would otherwise hit the 20 per minute token limit
    const response = await refreshRequest(client, tokens.refresh_token);
    if (response.status !== 200) break;
    tokens = await response.json(); rotations++;
    const row = (await asOwner("SELECT max(expires_at) AS latest,max(family_expires_at) AS family FROM cms_auth.oauth_tokens WHERE client_id=$1 AND revoked_at IS NULL", [client.clientId])).rows[0];
    assert.ok(row.latest.getTime() <= row.family.getTime(), "nothing outlives the 24 hour family");
  }
  assert.equal(rotations, 28, "rotations stop at the 24 hour absolute limit (50 min steps)");
  clock = 24 * 3600000 + 60000; assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
});

test("Owner checks on every call: disabled account is 401 and loses all tokens, demoted account is 403, restored Owner works again", async () => {
  const { client: ownerClient, tokens } = await login();
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200);
  try {
    await asOwner("UPDATE cms_auth.roles SET role='staff' WHERE user_id=$1", [owner.id]);
    const demoted = await rpc(tokens.access_token, "tools/list");
    assert.equal(demoted.status, 403); assert.ok(demoted.headers.get("www-authenticate"));
    await asOwner("UPDATE cms_auth.roles SET role='owner' WHERE user_id=$1", [owner.id]);
    assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200, "role restored: token unaffected by a mere demotion");
    await asOwner("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [owner.id]);
    assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
    await asOwner("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [owner.id]);
    assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401, "tokens were retired when the account was found disabled");
    assert.equal((await refreshRequest(ownerClient, tokens.refresh_token)).status, 400);
  } finally { await asOwner("UPDATE cms_auth.roles SET role='owner',enabled=true WHERE user_id=$1", [owner.id]); }
  // An account that stopped being an Owner cannot authorize or redeem a code either.
  const client = await newClient(); const { verifier, challenge } = pkce();
  const params = await codeFrom(await postAuthorize(authorizeBody(client, challenge)));
  try {
    await asOwner("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [owner.id]);
    assert.equal((await exchange(client, params, verifier)).status, 400);
  } finally { await asOwner("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [owner.id]); }
});

test("credentials: cookie-only, bad, foreign-resource and read-only tokens are refused; writes need mcp:write", async () => {
  const cookie = ownerJar.header();
  const cookieOnly = await rpc(null, "tools/list", undefined, { cookie });
  assert.equal(cookieOnly.status, 401); assert.match(cookieOnly.headers.get("www-authenticate"), /oauth-protected-resource/);
  assert.equal((await rpc("tomcp_at_" + "A".repeat(43), "tools/list", undefined, { cookie })).status, 401);
  assert.equal((await rpc("garbage", "tools/list")).status, 401);
  assert.equal((await rpc(null, "tools/list")).status, 401);
  assert.equal((await rpc(null, "tools/list")).headers.get("cache-control"), "no-store");
  const { tokens } = await login({ extra: { scope: "mcp:read" } });
  assert.equal(tokens.scope, "mcp:read");
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200);
  await inTransaction(async () => { assert.ok((await call(tokens.access_token, "page_list", {})).ok.length > 0); });
  const write = await call(tokens.access_token, "menu_create", { name: "Tidak", price: 1 });
  assert.deepEqual([write.error.code, write.error.status], ["INSUFFICIENT_SCOPE", 403]);
  assert.equal(refreshes, 0);
  // Tokens are bound to this resource: a row for another audience is rejected.
  await asOwner("UPDATE cms_auth.oauth_tokens SET resource='https://other.example/api/mcp' WHERE family_id=(SELECT family_id FROM cms_auth.oauth_tokens WHERE token_hash=$1)", [hashSecret(tokens.access_token)]);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
  assert.equal((await rpc((await login()).tokens.access_token, "tools/list", undefined, { origin: "https://evil.example" })).status, 403);
  assert.equal((await rpc((await login()).tokens.access_token, "tools/list", undefined, { origin: base })).status, 200);
});

test("client management: disabling a client revokes its tokens at once; registrations are validated; revoke endpoint retires a family", async () => {
  const { client, tokens } = await login();
  const listed = (await mcp.clients.list()).find(row => row.clientId === client.clientId);
  assert.equal(listed.activeConnections, 1); assert.equal(listed.disabledAt, null);
  await assert.rejects(newClient("x", ["http://evil.example/cb"]), { code: "INVALID_REDIRECT_URI" });
  await assert.rejects(newClient("", [redirectUri]), { code: "INVALID_NAME" });
  await assert.rejects(mcp.clients.disable("mcpc_unknown"), { code: "NOT_FOUND" });
  const revokeRequest = (form) => mcp.oauth.revoke(new Request(base + "/api/mcp/oauth/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }));
  const stranger = await newClient("Asing");
  assert.equal((await revokeRequest({ token: tokens.refresh_token, client_id: stranger.clientId })).status, 200);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200, "another client cannot revoke it");
  assert.equal((await revokeRequest({ token: tokens.refresh_token, client_id: client.clientId })).status, 200);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401, "revoking the refresh token retires the family");
  assert.equal((await revokeRequest({ token: "garbage", client_id: client.clientId })).status, 200);
  assert.ok((await audits("token_revoked")).length >= 1);
  const again = await login();
  await mcp.clients.disable(again.client.clientId);
  assert.equal((await rpc(again.tokens.access_token, "tools/list")).status, 401);
  assert.equal((await refreshRequest(again.client, again.tokens.refresh_token)).status, 401);
  assert.ok((await mcp.clients.list()).find(row => row.clientId === again.client.clientId).disabledAt);
});

test("rate limits: authorize, token and /api/mcp return 429 with Retry-After and are audited", async () => {
  const client = await newClient(); const { challenge } = pkce();
  const authorizeGet = () => mcp.oauth.authorizeGet(new Request(base + "/api/mcp/oauth/authorize?" + new URLSearchParams({ client_id: client.clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256" })));
  for (let n = 0; n < 20; n++) assert.equal((await authorizeGet()).status, 302);
  const limitedAuthorize = await authorizeGet();
  assert.equal(limitedAuthorize.status, 429); assert.ok(Number(limitedAuthorize.headers.get("retry-after")) > 0);
  await fixture.expireLimits();
  for (let n = 0; n < 20; n++) assert.equal((await postAuthorize({ ...authorizeBody(client, challenge), decision: "deny" })).status, 200);
  assert.equal((await postAuthorize({ ...authorizeBody(client, challenge), decision: "deny" })).status, 429);
  await fixture.expireLimits();
  for (let n = 0; n < 20; n++) assert.equal((await tokenRequest({ grant_type: "authorization_code", client_id: client.clientId, code: "x" })).status, 400);
  const limitedToken = await tokenRequest({ grant_type: "authorization_code", client_id: client.clientId, code: "x" });
  assert.equal(limitedToken.status, 429); assert.ok(limitedToken.headers.get("retry-after"));
  await fixture.expireLimits();
  const { tokens } = await login();
  await fixture.expireLimits();
  let status = 200, count = 0;
  while (status === 200 && count < 80) { status = (await rpc(tokens.access_token, "tools/list")).status; count++; }
  assert.equal(status, 429); assert.equal(count, 61, "60 calls per minute per user");
  const limited = await rpc(tokens.access_token, "tools/list"); assert.ok(limited.headers.get("retry-after"));
  await fixture.expireLimits();
  let writes = 0, writeStatus = 200;
  while (writeStatus === 200 && writes < 40) { writeStatus = (await rpc(tokens.access_token, "tools/call", { name: "menu_create", arguments: {} })).status; writes++; }
  assert.equal(writeStatus, 429); assert.equal(writes, 21, "20 writes per minute per user");
  assert.ok((await audits("rate_limited")).length >= 3);
});

// ---- Q-5 photo upload against the real cms_auth.mcp_uploads (needs migration 0019: npm run db:migrate:test). ----
// The CMS upload itself runs for real (createCmsMedia.upload -> asset registration) with a stand-in for the file storage only.
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const uploadTest = (name, run) => test(name, async t => {
  if (!uploadsReady) return t.skip("mcp_uploads is missing: migration 0019 has not been applied to the test database");
  storageOverride = { receive: async (body, mime) => {
    if (storageFailure) throw storageFailure;
    const reader = body.getReader(); while (!(await reader.read()).done); // drain like the real storage
    return { report: { ...inspectedImage(randomUUID() + ".png"), mime }, discard: async () => {} };
  } };
  storageFailure = null;
  try { await run(t); } finally { storageOverride = null; storageFailure = null; }
});
const uploadRow = async id => (await asOwner("SELECT * FROM cms_auth.mcp_uploads WHERE id=$1", [id])).rows[0];
const tokenFrom = url => url.split("/").pop();
const sendUpload = (url, { headers = {}, body = PNG_BYTES, type = "image/png" } = {}) => mcp.uploads.handle(new Request(url, { method: "POST",
  headers: { "content-type": type, "content-length": String(body.length), ...headers }, body }), tokenFrom(url));
const requestUpload = async (token, args = {}) => { const result = await call(token, "media_upload_request", args); assert.ok(result.ok, JSON.stringify(result)); return result.ok; };

uploadTest("Q-5 AC-19/20/32: media_upload_request stores two hashed tokens, returns both URLs and audits without secrets", async () => {
  const { client, tokens } = await login();
  await inTransaction(async () => {
    const made = await requestUpload(tokens.access_token, { target: "menu:roti-bakar", mime: "image/png", byteSize: PNG_BYTES.length });
    assert.match(made.agentUploadUrl, new RegExp(`^${base}/api/mcp/upload/tomcp_ug_[A-Za-z0-9_-]{43}$`)); assert.match(made.userUploadUrl, new RegExp(`^${base}/admin/mcp/upload/tomcp_uu_[A-Za-z0-9_-]{43}$`));
    const row = await uploadRow(made.uploadId);
    assert.deepEqual([row.user_id, row.client_id, row.status, row.target, row.mime_declared, Number(row.byte_size_declared), row.asset_id], [owner.id, client.clientId, "pending", "menu:roti-bakar", "image/png", PNG_BYTES.length, null]);
    assert.equal(row.agent_token_hash, hashSecret(tokenFrom(made.agentUploadUrl))); assert.equal(row.user_token_hash, hashSecret(tokenFrom(made.userUploadUrl)));
    assert.equal(row.expires_at.getTime() - row.created_at.getTime(), 15 * 60000);
    const rows = await audits(undefined, client.clientId);
    const requested = rows.filter(item => item.event === "upload_requested");
    assert.deepEqual(requested.map(item => [item.user_id, item.target, item.outcome]), [[owner.id, "menu:roti-bakar", "ok"]]);
    const dump = JSON.stringify(rows) + JSON.stringify(row);
    assert.ok(!dump.includes(tokenFrom(made.agentUploadUrl)) && !dump.includes(tokenFrom(made.userUploadUrl)), "no token or URL in audit rows or the table");
    for (const bad of [{ mime: "image/gif" }, { byteSize: 10000001 }, { byteSize: 0 }, { target: "post:x" }, { extra: 1 }]) assert.equal((await call(tokens.access_token, "media_upload_request", bad)).error.code, "INVALID_INPUT");
    // The runtime role can append and write only the outcome columns; it cannot delete or rewrite identity.
    await assert.rejects(() => fixture.pool.query("DELETE FROM cms_auth.mcp_uploads WHERE id=$1", [made.uploadId]), /permission denied/);
    await assert.rejects(() => fixture.pool.query("UPDATE cms_auth.mcp_uploads SET user_id=user_id WHERE id=$1", [made.uploadId]), /permission denied/);
    await assert.rejects(() => asOwner("UPDATE cms_auth.mcp_uploads SET agent_used_at=now(),user_used_at=now() WHERE id=$1", [made.uploadId]), /mcp_upload_one_path/);
  });
});

uploadTest("Q-5 AC-21/23/27/32: the agent URL uploads once through createCmsMedia.upload; status shows done only to the owner client", async () => {
  const { client, tokens } = await login();
  await inTransaction(async tx => {
    const made = await requestUpload(tokens.access_token, { target: "page:about" });
    assert.deepEqual((await call(tokens.access_token, "media_upload_status", { uploadId: made.uploadId })).ok, { status: "pending" });
    const response = await sendUpload(made.agentUploadUrl, { headers: { cookie: staffJar.header() } });
    assert.equal(response.status, 200); const { assetId } = await response.json();
    assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("referrer-policy"), "no-referrer"); assert.match(response.headers.get("x-robots-tag"), /noindex/);
    const asset = (await tx.execute(`SELECT id,kind,mime FROM public.media_assets WHERE id='${assetId}'`)).rows[0];
    assert.deepEqual([asset.kind, asset.mime], ["image", "image/png"]);
    const row = await uploadRow(made.uploadId);
    assert.deepEqual([row.status, row.asset_id, row.failure_code], ["done", assetId, null]); assert.ok(row.agent_used_at && !row.user_used_at);
    assert.deepEqual((await call(tokens.access_token, "media_upload_status", { uploadId: made.uploadId })).ok, { status: "done", assetId });
    assert.equal((await sendUpload(made.agentUploadUrl)).status, 410, "single use");
    assert.equal((await sendUpload(made.userUploadUrl, { headers: { cookie: ownerJar.header(), origin: base } })).status, 410, "the other path is closed");
    const completed = (await audits("upload_completed", client.clientId));
    assert.deepEqual(completed.map(item => [item.user_id, item.target, item.outcome]), [[owner.id, "page:about", "ok"]]);
    // Another OAuth client of the same Owner cannot read the request.
    const second = await login();
    assert.equal((await call(second.tokens.access_token, "media_upload_status", { uploadId: made.uploadId })).error.code, "NOT_FOUND");
  });
});

uploadTest("Q-5 AC-26: concurrent uploads with one token produce exactly one asset", async () => {
  const { tokens } = await login();
  await inTransaction(async tx => {
    const made = await requestUpload(tokens.access_token, {});
    const before = Number((await tx.execute("SELECT count(*)::int AS n FROM public.media_assets")).rows[0].n);
    const results = await Promise.all(Array.from({ length: 5 }, () => sendUpload(made.agentUploadUrl)));
    assert.deepEqual(results.map(response => response.status).sort(), [200, 410, 410, 410, 410]);
    assert.equal(Number((await tx.execute("SELECT count(*)::int AS n FROM public.media_assets")).rows[0].n), before + 1);
    const raced = await requestUpload(tokens.access_token, {});
    const both = await Promise.all([sendUpload(raced.agentUploadUrl), sendUpload(raced.userUploadUrl, { headers: { cookie: ownerJar.header(), origin: base } })]);
    assert.deepEqual(both.map(response => response.status).sort(), [200, 410]);
    const row = await uploadRow(raced.uploadId);
    assert.equal(row.status, "done"); assert.ok(Boolean(row.agent_used_at) !== Boolean(row.user_used_at));
  });
});

uploadTest("Q-5 AC-22: the user path needs the same Owner session and a same-origin post; refusals consume nothing", async () => {
  const { tokens } = await login();
  await inTransaction(async () => {
    const made = await requestUpload(tokens.access_token, {});
    const status = async headers => (await sendUpload(made.userUploadUrl, { headers })).status;
    assert.equal(await status({ origin: base }), 401, "no login");
    assert.equal(await status({ cookie: staffJar.header(), origin: base }), 403, "Staff");
    assert.equal(await status({ cookie: ownerJar.header() }), 403, "no Origin");
    assert.equal(await status({ cookie: ownerJar.header(), origin: "https://evil.example" }), 403, "cross-origin");
    assert.deepEqual([(await uploadRow(made.uploadId)).status, (await uploadRow(made.uploadId)).user_used_at], ["pending", null]);
    // The same token string is not valid as an agent token, and the agent token is not valid for the page.
    assert.equal((await sendUpload(`${base}/api/mcp/upload/${tokenFrom(made.agentUploadUrl)}`, { headers: { cookie: ownerJar.header() } })).status, 200, "agent path ignores the cookie and succeeds");
    const another = await requestUpload(tokens.access_token, {});
    const form = await sendUpload(another.userUploadUrl, { headers: { cookie: ownerJar.header(), origin: base, accept: "text/html" } });
    assert.equal(form.status, 303); assert.equal(form.headers.get("location"), `/admin/mcp/upload/${tokenFrom(another.userUploadUrl)}?r=ok`);
    const row = await uploadRow(another.uploadId);
    assert.deepEqual([row.status, Boolean(row.user_used_at), row.agent_used_at], ["done", true, null]);
    const state = await mcp.uploads.describe(tokenFrom(another.userUploadUrl), { subject: owner.id, role: "owner" });
    assert.equal(state.state, "done");
    assert.equal((await mcp.uploads.describe(tokenFrom(another.userUploadUrl), { subject: staff.id, role: "staff" })).state, "invalid");
  });
});

uploadTest("Q-5 AC-24: a disabled Owner cannot finish an upload; the row is rejected", async () => {
  const { client, tokens } = await login();
  await inTransaction(async () => {
    const made = await requestUpload(tokens.access_token, {});
    try {
      await asOwner("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [owner.id]);
      assert.equal((await sendUpload(made.agentUploadUrl)).status, 401);
    } finally { await asOwner("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [owner.id]); }
    const row = await uploadRow(made.uploadId);
    assert.deepEqual([row.status, row.failure_code, row.asset_id], ["rejected", "REJECTED", null]);
    assert.deepEqual((await audits("upload_rejected", client.clientId)).map(item => [item.user_id, item.outcome, item.code]), [[owner.id, "denied", "REJECTED"]]);
    // A disabled OAuth client cannot finish one either.
    const second = await requestUpload(tokens.access_token, {});
    await mcp.clients.disable(client.clientId);
    assert.equal((await sendUpload(second.agentUploadUrl)).status, 401);
    assert.equal((await uploadRow(second.uploadId)).status, "rejected");
  });
});

uploadTest("Q-5 AC-25/27: expiry, declared mime/size, non-images and oversize reject; storage trouble keeps the token", async () => {
  const { client, tokens } = await login();
  await inTransaction(async () => {
    const expiring = await requestUpload(tokens.access_token, {});
    clock = 5 * 60000 + 1000;
    const late = await sendUpload(expiring.agentUploadUrl);
    assert.deepEqual([late.status, (await late.json()).code], [410, "TOKEN_EXPIRED"]);
    assert.equal((await uploadRow(expiring.uploadId)).status, "pending");
    clock = 15 * 60000 + 1000;
    // The access token itself lapses at 15 minutes, so the derived status is read through the same service the tool uses.
    assert.deepEqual(await mcp.uploads.status({ subject: owner.id, clientId: client.clientId }, { uploadId: expiring.uploadId }), { status: "expired" });
    clock = 0;

    const cases = [[{ mime: "image/jpeg" }, {}, "MIME_MISMATCH", 400], [{ byteSize: PNG_BYTES.length + 1 }, {}, "SIZE_MISMATCH", 400], [{}, { body: new Uint8Array(10000001) }, "OVERSIZED", 413]];
    for (const [args, post, expected, httpStatus] of cases) {
      const made = await requestUpload(tokens.access_token, args);
      const response = await sendUpload(made.agentUploadUrl, post);
      assert.deepEqual([response.status, (await response.json()).code], [httpStatus, expected]);
      const row = await uploadRow(made.uploadId);
      assert.deepEqual([row.status, row.failure_code, row.asset_id], ["rejected", expected, null]);
      assert.deepEqual((await call(tokens.access_token, "media_upload_status", { uploadId: made.uploadId })).ok, { status: "rejected", failureCode: expected });
      assert.equal((await sendUpload(made.agentUploadUrl)).status, 410);
    }
    const notImage = await requestUpload(tokens.access_token, {});
    storageFailure = new MediaError("INVALID_MEDIA", "Declared MIME does not match decoded file.");
    assert.equal((await sendUpload(notImage.agentUploadUrl)).status, 400);
    assert.equal((await uploadRow(notImage.uploadId)).failure_code, "NOT_IMAGE");

    const transient = await requestUpload(tokens.access_token, {});
    storageFailure = new MediaError("STORAGE_UNAVAILABLE", "disk");
    const failed = await sendUpload(transient.agentUploadUrl);
    assert.deepEqual([failed.status, (await failed.json()).code], [503, "UPLOAD_FAILED"]);
    const kept = await uploadRow(transient.uploadId);
    assert.deepEqual([kept.status, kept.agent_used_at, kept.user_used_at], ["pending", null, null]);
    storageFailure = null;
    assert.equal((await sendUpload(transient.agentUploadUrl)).status, 200, "retry with the same token");
    assert.equal((await uploadRow(transient.uploadId)).status, "done");
    assert.equal((await sendUpload(`${base}/api/mcp/upload/${"tomcp_ug_" + "A".repeat(43)}`)).status, 404);
  });
});

uploadTest("Q-5: when the asset is stored but the 'done' update keeps failing, the token is NOT released (no duplicate asset)", async () => {
  const { client, tokens } = await login();
  await inTransaction(async () => {
    const made = await requestUpload(tokens.access_token, {});
    let failures = 99, attempts = 0;
    const flakyPool = new Proxy(fixture.pool, { get: (target, name) => {
      if (name !== "query") return typeof target[name] === "function" ? target[name].bind(target) : target[name];
      return (text, ...rest) => {
        if (failures > 0 && /status='done'/.test(String(text))) { failures--; attempts++; return Promise.reject(new Error("db down")); }
        return target.query(text, ...rest);
      };
    } });
    const flaky = buildMcp({ pool: flakyPool, consume: fixture.service.consume, baseURL: base, now: baseNow,
      authenticateSession: headers => fixture.service.authenticate(headers),
      cmsFor: actor => { const context = { db: currentDb, authenticate: async () => ({ subject: actor.subject, role: actor.role }) };
        return { pages: createCmsPages(context), catalog: createCmsCatalog(context), media: createCmsMedia({ ...context, storage: storageOverride ?? undefined }) }; },
      refreshPublic: () => {} });
    const assetCount = async () => (await currentDb.execute("SELECT count(*)::int AS n FROM public.media_assets")).rows[0].n;
    const before = await assetCount();
    const url = made.agentUploadUrl;
    const failed = await flaky.uploads.handle(new Request(url, { method: "POST", headers: { "content-type": "image/png", "content-length": String(PNG_BYTES.length) }, body: PNG_BYTES }), tokenFrom(url));
    assert.deepEqual([failed.status, (await failed.json()).code], [500, "RECORD_FAILED"]);
    assert.equal(attempts, 3, "bounded retries");
    assert.equal(await assetCount(), before + 1, "the asset was stored once");
    const row = await uploadRow(made.uploadId);
    assert.equal(row.status, "rejected"); assert.equal(row.failure_code, "RECORD_FAILED"); assert.notEqual(row.agent_used_at, null); assert.match(String(row.asset_id), /^[0-9a-f-]{36}$/);
    // The token is not returned: a second POST is refused and stores nothing more.
    assert.equal((await sendUpload(url)).status, 410);
    assert.equal(await assetCount(), before + 1, "no duplicate asset");
    assert.deepEqual(await mcp.uploads.status({ subject: owner.id, clientId: client.clientId }, { uploadId: made.uploadId }), { status: "rejected", failureCode: "RECORD_FAILED" });
  });
});

uploadTest("Q-5 AC-30: more than 10 upload requests per minute per Owner return 429 with Retry-After", async () => {
  const { tokens } = await login();
  await inTransaction(async () => {
    for (let index = 0; index < 10; index++) await requestUpload(tokens.access_token, {});
    const response = await rpc(tokens.access_token, "tools/call", { name: "media_upload_request", arguments: {} });
    assert.equal(response.status, 429); assert.ok(Number(response.headers.get("retry-after")) > 0);
    assert.ok((await audits("rate_limited")).some(item => item.tool === "upload" && item.code === "RATE_LIMITED"));
    // Reading status is a read tool and is not blocked by the upload budget.
    assert.equal((await call(tokens.access_token, "media_upload_status", { uploadId: randomUUID() })).error.code, "NOT_FOUND");
  });
});

// Last on purpose: changing the Owner password ends every other Owner session, including ownerJar used by the tests above.
test("password change retires every MCP token of that account", async () => {
  const { tokens } = await login();
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 200);
  const jar = cookieJar();
  assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password: fixture.password }, jar)).status, 200);
  const next = "QA-new-" + randomBytes(24).toString("hex");
  assert.equal((await callAuth(fixture, "/change-password", { currentPassword: fixture.password, newPassword: next }, jar)).status, 200);
  assert.equal((await rpc(tokens.access_token, "tools/list")).status, 401);
  assert.equal(Number((await asOwner("SELECT count(*) FROM cms_auth.oauth_tokens WHERE user_id=$1 AND revoked_at IS NULL", [owner.id])).rows[0].count), 0);
});
