import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuthFixture, cookieJar, callAuth } from "../fixtures/auth.mjs";
import { createCmsCatalog } from "../../src/server/cms/catalog.mjs";
import { createCmsMedia } from "../../src/server/cms/media.mjs";
import { inspectImage } from "../../src/server/media/storage.mjs";
import { getCmsDatabaseConfig } from "../../src/server/cms/request-policy.mjs";

// Card image + alt text (spec section 16, AC-20..AC-27). Storage is an in-memory double injected through
// createCmsMedia({ storage }); file content is still validated by the real sharp-based inspectImage. No
// .media directory is touched, so this runs on Windows. Every service test rolls back.
let fixture, pool, jars, cookies, mediaRoute, savedEnv;
const ENV_KEYS = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "PUBLIC_DATABASE_TARGET"];
before(async () => {
  fixture = await createAuthFixture(); pool = new pg.Pool(getCmsDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" })); jars = []; cookies = [];
  for (const account of fixture.accounts) {
    const jar = cookieJar(); assert.equal((await callAuth(fixture, "/sign-in/email", { email: account.email, password: fixture.password }, jar)).status, 200);
    jars.push(new Headers({ cookie: jar.header() })); cookies.push(jar.header());
  }
  // The route helper builds its auth service from process.env; point it at this fixture's secret (never printed).
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  Object.assign(process.env, { BETTER_AUTH_SECRET: fixture.env.BETTER_AUTH_SECRET, BETTER_AUTH_URL: fixture.env.BETTER_AUTH_URL, PUBLIC_DATABASE_TARGET: "test" });
  ({ mediaRoute } = await import("../../src/server/media/http.mjs"));
});
after(async () => {
  await globalThis[Symbol.for("tiny-osaka.cms.pool")]?.end(); await globalThis[Symbol.for("tiny-osaka.auth.pool")]?.end();
  for (const key of ENV_KEYS) { if (savedEnv?.[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
  await pool?.end(); await fixture?.cleanup();
});
const memoryStorage = () => ({
  receive: async (body, mime) => {
    const bytes = Buffer.from(await new Response(body).arrayBuffer());
    const report = await inspectImage(bytes);
    assert.equal(report.mime, mime);
    return { report: { ...report, storageKey: randomUUID() + "." + report.extension, byteSize: bytes.length,
      checksum: createHash("sha256").update(bytes).digest("hex"), verified: true }, discard: async () => {} };
  },
});
const rollback = new Error("rollback QA transaction");
const check = async callback => {
  try { await drizzle(pool).transaction(async tx => {
    const authenticate = headers => fixture.service.authenticate(headers);
    await callback(createCmsCatalog({ db: tx, authenticate }), tx, createCmsMedia({ db: tx, authenticate, storage: memoryStorage() })); throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
};
const [OWNER, STAFF] = [0, 1];
const input = (name, price = 25000, extra = {}) => ({ name, description: "", price, ...extra });
const rows = async (tx, text) => (await tx.execute(text)).rows;
const count = async (tx, table) => Number((await rows(tx, `SELECT count(*) AS n FROM public.${table}`))[0].n);
const stream = bytes => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
const png = (color = "red") => sharp({ create: { width: 40, height: 30, channels: 3, background: color } }).png().toBuffer();
const upload = async (media, jar, color) => (await media.upload(jar, stream(await png(color)), "image/png")).id;
const liveRefs = (tx, slug) => rows(tx, `SELECT r.asset_id, r.alt_id, r.alt_en, r.caption_id, r.caption_en, r.sort_order FROM public.catalog_media_refs r
  JOIN public.catalog_publication p ON p.revision_id = r.revision_id JOIN public.products pr ON pr.id = r.product_id WHERE pr.slug = '${slug}' ORDER BY r.sort_order`);
const assetCount = async (tx, ids) => Number((await rows(tx, `SELECT count(*) AS n FROM public.media_assets WHERE id IN (${ids.map(id => `'${id}'`).join(",")})`))[0].n);
const body = (card, extra) => ({ name: card.name, description: card.description, price: card.price, expectedVersion: card.version, ...extra });

test("Staff uploads and attaches an image on create; alt is stored in alt_id and listed with the card", () => check(async (api, tx, media) => {
  const asset = await upload(media, jars[STAFF]);
  const { product } = await api.create(jars[STAFF], input("QA Gambar", 25000, { imageAssetId: asset, imageAlt: "  Takoyaki di piring  " }));
  assert.deepEqual(product.image, { assetId: asset, alt: "Takoyaki di piring" });
  assert.deepEqual((await api.list(jars[OWNER])).products[0].image, product.image);
  const refs = await liveRefs(tx, product.slug);
  assert.deepEqual(refs.map(row => [row.asset_id, row.alt_id, row.alt_en, row.caption_id, row.caption_en, row.sort_order]), [[asset, "Takoyaki di piring", "", "", "", 0]]);
  assert.equal((await api.create(jars[OWNER], input("QA Tanpa Gambar"))).product.image, null);
  assert.equal((await api.create(jars[OWNER], input("QA Null", 1, { imageAssetId: null }))).product.image, null);
}));
test("create rejects incomplete or unusable images and writes nothing", () => check(async (api, tx, media) => {
  const asset = await upload(media, jars[OWNER]);
  const youtube = await media.youtube(jars[OWNER], { videoId: "Abc_123-xyz", posterId: asset });
  const before = [await count(tx, "catalog_revisions"), await count(tx, "products")];
  const bad = [[{ imageAssetId: asset }, "INVALID_IMAGE_ALT"], [{ imageAssetId: asset, imageAlt: "" }, "INVALID_IMAGE_ALT"], [{ imageAssetId: asset, imageAlt: "a<b" }, "INVALID_IMAGE_ALT"],
    [{ imageAssetId: asset, imageAlt: "x".repeat(501) }, "INVALID_IMAGE_ALT"], [{ imageAlt: "tanpa gambar" }, "IMAGE_REQUIRED"],
    [{ imageAssetId: randomUUID(), imageAlt: "x" }, "IMAGE_NOT_FOUND"], [{ imageAssetId: "bukan-uuid", imageAlt: "x" }, "INVALID_IMAGE"],
    [{ imageAssetId: youtube.id, imageAlt: "x" }, "INVALID_IMAGE"], [{ imageAssetId: null, imageAlt: "x" }, "INVALID_IMAGE_ALT"]];
  for (const [extra, code] of bad) await assert.rejects(api.create(jars[STAFF], input("QA Ditolak", 1, extra)), { code }, JSON.stringify(extra));
  assert.deepEqual([await count(tx, "catalog_revisions"), await count(tx, "products")], before);
}));
test("PATCH: six cases, replace, release, alt only, and the version token covers asset and alt", () => check(async (api, tx, media) => {
  const [first, second] = [await upload(media, jars[STAFF], "red"), await upload(media, jars[STAFF], "blue")];
  const created = (await api.create(jars[STAFF], input("QA Edit", 1000))).product;
  // (d) alt only without an image, (e) image without alt, (f) alt with a null image
  await assert.rejects(api.update(jars[STAFF], created.slug, body(created, { imageAlt: "x" })), { code: "IMAGE_REQUIRED" });
  await assert.rejects(api.update(jars[STAFF], created.slug, body(created, { imageAssetId: first })), { code: "INVALID_IMAGE_ALT" });
  await assert.rejects(api.update(jars[STAFF], created.slug, body(created, { imageAssetId: null, imageAlt: "x" })), { code: "INVALID_IMAGE_ALT" });
  // (a) keys absent and (c) clearing an absent image are no-ops
  const revisions = await count(tx, "catalog_revisions");
  assert.equal((await api.update(jars[STAFF], created.slug, body(created))).product.version, created.version);
  assert.equal((await api.update(jars[STAFF], created.slug, body(created, { imageAssetId: null }))).product.version, created.version);
  assert.equal(await count(tx, "catalog_revisions"), revisions);
  // (b) attach
  const attached = (await api.update(jars[STAFF], created.slug, body(created, { imageAssetId: first, imageAlt: "Merah" }))).product;
  assert.deepEqual(attached.image, { assetId: first, alt: "Merah" }); assert.notEqual(attached.version, created.version);
  // (a) a rename keeps the image and alt
  const renamed = (await api.update(jars[OWNER], created.slug, { ...body(attached), name: "QA Edit Baru" })).product;
  assert.deepEqual(renamed.image, attached.image);
  // an identical re-save is a no-op, also with the image pair repeated
  const total = await count(tx, "catalog_revisions");
  assert.equal((await api.update(jars[OWNER], created.slug, body(renamed, { imageAssetId: first, imageAlt: "Merah" }))).product.version, renamed.version);
  assert.equal(await count(tx, "catalog_revisions"), total);
  // (d) alt only: same asset, new alt, new snapshot
  const relabelled = (await api.update(jars[STAFF], created.slug, body(renamed, { imageAlt: "Merah polos" }))).product;
  assert.deepEqual(relabelled.image, { assetId: first, alt: "Merah polos" }); assert.notEqual(relabelled.version, renamed.version);
  // (b) replace: exactly one reference, the old asset stays registered
  const replaced = (await api.update(jars[STAFF], created.slug, body(relabelled, { imageAssetId: second, imageAlt: "Biru" }))).product;
  assert.deepEqual((await liveRefs(tx, created.slug)).map(row => [row.asset_id, row.alt_id]), [[second, "Biru"]]);
  assert.equal(await assetCount(tx, [first]), 1);
  // a token from before the replacement is stale
  await assert.rejects(api.update(jars[OWNER], created.slug, body(relabelled, { imageAlt: "Basi" })), { code: "PRODUCT_CONFLICT" });
  // (c) release: reference gone, assets kept
  const released = (await api.update(jars[OWNER], created.slug, body(replaced, { imageAssetId: null }))).product;
  assert.equal(released.image, null); assert.deepEqual(await liveRefs(tx, created.slug), []);
  assert.equal(await assetCount(tx, [first, second]), 2);
  await assert.rejects(api.update(jars[OWNER], created.slug, body(released, { imageAssetId: randomUUID(), imageAlt: "x" })), { code: "IMAGE_NOT_FOUND" });
}));
test("two sessions changing the same alt: one succeeds, one gets PRODUCT_CONFLICT; other cards keep their version", () => check(async (api, _tx, media) => {
  const asset = await upload(media, jars[OWNER]);
  const card = (await api.create(jars[OWNER], input("QA Bersama", 1, { imageAssetId: asset, imageAlt: "Awal" }))).product;
  const other = (await api.create(jars[OWNER], input("QA Lain"))).product;
  await api.update(jars[OWNER], card.slug, body(card, { imageAlt: "Dari Owner" }));
  await assert.rejects(api.update(jars[STAFF], card.slug, body(card, { imageAlt: "Dari Staff" })), { code: "PRODUCT_CONFLICT" });
  const list = (await api.list(jars[STAFF])).products;
  assert.equal(list.find(row => row.slug === card.slug).image.alt, "Dari Owner");
  assert.equal(list.find(row => row.slug === other.slug).version, other.version);
}));
test("deleting a product with an image purges its references and keeps the media asset", () => check(async (api, tx, media) => {
  const asset = await upload(media, jars[OWNER]);
  const card = (await api.create(jars[STAFF], input("QA Hapus Gambar", 1, { imageAssetId: asset, imageAlt: "Akan hilang" }))).product;
  const keep = (await api.create(jars[STAFF], input("QA Tetap Ada", 1, { imageAssetId: asset, imageAlt: "Tetap" }))).product;
  await assert.rejects(api.remove(jars[STAFF], card.slug), { code: "FORBIDDEN" });
  assert.deepEqual(await api.remove(jars[OWNER], card.slug), { deleted: true, slug: card.slug, name: card.name });
  assert.equal(Number((await rows(tx, `SELECT count(*) AS n FROM public.catalog_media_refs r JOIN public.products p ON p.id = r.product_id WHERE p.slug = '${card.slug}'`))[0].n), 0);
  assert.equal(await assetCount(tx, [asset]), 1);
  assert.deepEqual((await liveRefs(tx, keep.slug)).map(row => [row.asset_id, row.alt_id]), [[asset, "Tetap"]]);
  assert.deepEqual((await api.list(jars[OWNER])).products.map(row => row.slug), [keep.slug]);
}));
test("unknown keys stay rejected, anonymous callers cannot upload and non-image content is refused", () => check(async (api, _tx, media) => {
  await assert.rejects(api.create(jars[STAFF], input("QA", 1, { image: "x" })), { code: "INVALID_INPUT" });
  await assert.rejects(api.create(jars[STAFF], input("QA", 1, { imageUrl: "x" })), { code: "INVALID_INPUT" });
  await assert.rejects(media.upload(new Headers(), stream(await png()), "image/png"), { code: "AUTH_REQUIRED" });
  await assert.rejects(media.upload(jars[STAFF], stream(Buffer.from("not an image")), "image/png"), { code: "INVALID_MEDIA" });
}));
test("upload route: no session is 401; wrong Origin or cross-site fetch is 403 before any storage access", async () => {
  const send = ({ cookie, origin = fixture.env.BETTER_AUTH_URL, site } = {}) => mediaRoute(new Request("http://127.0.0.1:3033/api/cms/media/upload", { method: "POST",
    headers: { "content-type": "image/png", ...(origin === null ? {} : { origin }), ...(cookie ? { cookie } : {}), ...(site ? { "sec-fetch-site": site } : {}) }, body: Buffer.from("x") }),
  () => { throw new Error("storage must not be reached"); }, { upload: true });
  assert.equal((await send()).status, 401);
  assert.equal((await send({ cookie: "better-auth.session_token=forged" })).status, 401);
  for (const cookie of cookies) {
    assert.equal((await send({ cookie, origin: "https://evil.example" })).status, 403);
    assert.equal((await send({ cookie, origin: null })).status, 403);
    assert.equal((await send({ cookie, site: "cross-site" })).status, 403);
  }
});
