import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mediaPolicy } from "../../src/server/media/policy.mjs";
import { MediaError, validateMediaAsset, validateRevisionMedia, validStorageKey, validYoutubeId,
  mediaHashSnapshot, publicRevisionMedia } from "../../src/server/media/validation.mjs";
import { createMediaAssets } from "../../src/server/media/assets.mjs";
import { createMediaReferences } from "../../src/server/media/references.mjs";
import { hashCatalogContent, catalogContentFields } from "../../src/server/catalog/content-hash.mjs";
import { hashPageContent } from "../../src/server/pages/content-hash.mjs";
import { pageGraph } from "../fixtures/page-content.mjs";
import { imageAsset, inspectedImage, reference } from "../fixtures/media.mjs";

const code = expected => error => error instanceof MediaError && error.code === expected;
const actor = async () => ({ subject: "qa-server-subject", role: "staff" });
const db = new Proxy({}, { get: () => { throw new Error("private-database-secret"); } });
const mediaGraph = () => {
  const g = pageGraph(), asset = imageAsset();
  return { ...g, mediaRefs: [reference(g.revision.id, asset.id)], mediaAssets: [asset] };
};

test("approved image MIME, decimal size and dimensions accept exact bounds", () => {
  for (const [mime, ext] of [["image/jpeg", "jpg"], ["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"]]) {
    assert.equal(validateMediaAsset(imageAsset({ mime, storageKey: randomUUID() + "." + ext,
      byteSize: mediaPolicy.imageBytes, width: 4096, height: 4096 })), true);
  }
});

test("malformed/unsafe storage keys, checksum, MIME and image limits fail closed", () => {
  for (const change of [
    { storageKey: "../image.png" }, { storageKey: "https://example.com/x.png" }, { storageKey: "C:\\private\\image.png" },
    { mime: "image/svg+xml" }, { mime: "image/gif" }, { mime: "image/jpeg" }, { checksum: null }, { checksum: "Z".repeat(64) },
    { byteSize: 10000001 }, { byteSize: 0 }, { byteSize: 1.5 }, { width: 4097 }, { height: null },
    { durationMs: 1 }, { posterId: randomUUID() }, { externalId: "forged" },
  ]) assert.throws(() => validateMediaAsset(imageAsset(change)), code("INVALID_MEDIA"));
  for (const key of ["foo.png", randomUUID() + ".PNG", randomUUID() + ".png?x=1", "/" + randomUUID() + ".png"]) {
    assert.equal(validStorageKey(key), false);
  }
});

test("stored video requires image poster reference, bounded duration/dimensions and correct MIME", () => {
  const posterId = randomUUID();
  const video = imageAsset({ kind: "video", mime: "video/mp4", storageKey: randomUUID() + ".mp4",
    byteSize: 100000000, width: 1920, height: 1080, durationMs: 120000, posterId });
  assert.equal(validateMediaAsset(video), true);
  assert.equal(validateMediaAsset({ ...video, width: 1080, height: 1920 }), true);
  assert.equal(validateMediaAsset({ ...video, mime: "video/webm", storageKey: randomUUID() + ".webm" }), true);
  for (const change of [{ posterId: null }, { durationMs: 120001 }, { durationMs: 0 }, { width: 1921 },
    { width: 1920, height: 1081 }, { byteSize: 100000001 }, { width: -1 }]) {
    assert.throws(() => validateMediaAsset({ ...video, ...change }), code("INVALID_MEDIA"));
  }
});

test("YouTube contract accepts only an ID, with no arbitrary URL/iframe or fake file fields", () => {
  const asset = { id: randomUUID(), kind: "youtube", externalId: "Abc_123-xyz", posterId: randomUUID(),
    storageKey: null, mime: null, byteSize: null, width: null, height: null, durationMs: null, checksum: null };
  assert.equal(validateMediaAsset(asset), true);
  for (const id of ["https://youtube.com/watch?v=Abc_123-xyz", "<iframe>x</iframe>", "x", "Abc_123-xyz?"]) {
    assert.equal(validYoutubeId(id), false);
    assert.throws(() => validateMediaAsset({ ...asset, externalId: id }), code("INVALID_MEDIA"));
  }
  assert.throws(() => validateMediaAsset({ ...asset, storageKey: randomUUID() + ".png" }), code("INVALID_MEDIA"));
});

test("media graph requires scoped references, Indonesian alt labels, exact assets and image posters", () => {
  const g = mediaGraph();
  assert.equal(validateRevisionMedia(g, "page"), true);
  for (const mutate of [
    g => { g.mediaRefs[0].revisionId = randomUUID(); }, g => { g.mediaRefs[0].assetId = randomUUID(); },
    g => { g.mediaRefs[0].altId = " "; }, g => { g.mediaRefs[0].captionId = "x\0y"; },
    g => { g.mediaRefs[0].sortOrder = -1; }, g => { g.mediaAssets.push(imageAsset()); },
    g => { g.mediaRefs.push({ ...g.mediaRefs[0] }); }, g => { delete g.mediaAssets; },
    g => { g.mediaRefs = [null]; }, g => { g.revision = null; },
  ]) { const changed = structuredClone(g); mutate(changed); assert.throws(() => validateRevisionMedia(changed, "page"), code("INVALID_MEDIA")); }
  const draft = structuredClone(g); draft.mediaRefs[0].altEn = "";
  assert.equal(validateRevisionMedia(draft, "page", { ready: false }), true);
  const video = imageAsset({ kind: "video", mime: "video/mp4", storageKey: randomUUID() + ".mp4",
    durationMs: 1000, posterId: g.mediaAssets[0].id });
  g.mediaAssets.push(video); g.mediaRefs[0].assetId = video.id;
  assert.equal(validateRevisionMedia(g, "page"), true);
  g.mediaAssets = [video];
  assert.throws(() => validateRevisionMedia(g, "page"), code("INVALID_MEDIA"));
});

test("references enforce twelve per page/product and cannot target another product scope", () => {
  const g = mediaGraph();
  g.mediaRefs = Array.from({ length: 12 }, (_, sortOrder) => reference(g.revision.id, g.mediaAssets[0].id, { sortOrder }));
  assert.equal(validateRevisionMedia(g, "page"), true);
  g.mediaRefs.push(reference(g.revision.id, g.mediaAssets[0].id));
  assert.throws(() => validateRevisionMedia(g, "page"), code("INVALID_MEDIA"));
  const c = mediaGraph(); const productId = randomUUID();
  c.productEntries = [{ revisionId: c.revision.id, productId }];
  c.mediaRefs[0].productId = productId;
  assert.equal(validateRevisionMedia(c, "catalog"), true);
  c.mediaRefs[0].productId = randomUUID();
  assert.throws(() => validateRevisionMedia(c, "catalog"), code("INVALID_MEDIA"));
});

test("legacy catalog/page hash constants remain unchanged with empty or absent media", () => {
  const c = { revision: { id: "revision", version: 1, status: "draft" },
    ...Object.fromEntries(Object.entries(catalogContentFields).map(([table, fields]) => [table,
      [1, 2].map(n => Object.fromEntries(fields.map(field => [field, field + n])))])) };
  const p = pageGraph(); p.revision.id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  for (const row of p.translations) row.revisionId = p.revision.id;
  for (const empty of [{}, { mediaRefs: [], mediaAssets: [] }]) {
    assert.equal(hashCatalogContent({ ...c, ...empty }), "5a34ea627645ae1f1b7c033fd77db669275027c57a2f77c8c7a204bf6181fb3e");
    assert.equal(hashPageContent({ ...p, ...empty }), "f3a9b7c579098c61387c2e8921f9fb133e65d6334b91e4198762be0b134e6f89");
  }
});

test("media hash binds labels, captions, order, asset metadata and inspector checksum", () => {
  const g = mediaGraph(), expected = hashPageContent(g);
  assert.notEqual(expected, hashPageContent({ ...g, mediaRefs: [], mediaAssets: [] }));
  for (const mutate of [
    g => { g.mediaRefs[0].altId += " changed"; }, g => { g.mediaRefs[0].altEn += " changed"; },
    g => { g.mediaRefs[0].captionId = "caption"; }, g => { g.mediaRefs[0].captionEn = "caption"; },
    g => { g.mediaRefs[0].sortOrder = 1; }, g => { g.mediaRefs[0].id = randomUUID(); },
    g => { g.mediaAssets[0].checksum = "b".repeat(64); }, g => { g.mediaAssets[0].storageKey = randomUUID() + ".png"; },
    g => { g.mediaAssets[0].byteSize++; }, g => { g.mediaAssets[0].width++; }, g => { g.mediaAssets[0].height++; },
  ]) { const changed = structuredClone(g); mutate(changed); assert.notEqual(hashPageContent(changed), expected); }
  const same = structuredClone(g); same.mediaAssets[0].createdAt = new Date();
  assert.equal(hashPageContent(same), expected);
  assert.ok(mediaHashSnapshot(g, "page"));
});

test("public media DTO localizes labels and omits storage/checksum/actor metadata", () => {
  const g = mediaGraph();
  for (const locale of ["id", "en"]) {
    const dto = publicRevisionMedia(g, "page", locale);
    assert.equal(dto[0].alt, locale === "id" ? "QA gambar" : "QA image");
    for (const secret of ["storageKey", "checksum", "createdAt", "actorId"]) assert.ok(!JSON.stringify(dto).includes(secret));
  }
});

test("all media operations require trusted identity, ignoring forged request roles", async () => {
  for (const factory of [createMediaAssets, createMediaReferences]) {
    const api = factory({ db });
    for (const action of Object.keys(api)) await assert.rejects(api[action]({ role: "owner", actorId: "forged" }), code("AUTH_REQUIRED"));
  }
  const bad = createMediaAssets({ db, resolveActor: async () => { throw new Error("private-auth-secret"); } });
  await assert.rejects(bad.registerFile({}), code("AUTH_REQUIRED"));
});

test("file registration without a connected inspector refuses browser metadata", async () => {
  const storageKey = randomUUID() + ".png";
  await assert.rejects(createMediaAssets({ db, resolveActor: actor }).registerFile({
    storageKey, mime: "image/png", byteSize: 1, checksum: "a".repeat(64), verified: true,
  }), code("INSPECTION_REQUIRED"));
  for (const report of [null, { ...inspectedImage(storageKey), verified: false },
    { ...inspectedImage(storageKey), storageKey: randomUUID() + ".png" }]) {
    await assert.rejects(createMediaAssets({ db, resolveActor: actor, inspectFile: async () => report }).registerFile({ storageKey }), code("INSPECTION_FAILED"));
  }
});

test("inspected limits override browser claims; adapter/driver errors are sanitized", async () => {
  const storageKey = randomUUID() + ".png";
  await assert.rejects(createMediaAssets({ db, resolveActor: actor, inspectFile: async () =>
    ({ ...inspectedImage(storageKey), byteSize: 10000001 }) }).registerFile({ storageKey, byteSize: 1 }), code("INVALID_MEDIA"));
  await assert.rejects(createMediaAssets({ db, resolveActor: actor, inspectFile: async () => { throw new Error("private-inspector-path"); } })
    .registerFile({ storageKey }), code("INSPECTION_FAILED"));
  let context;
  await assert.rejects(createMediaAssets({ db, resolveActor: actor, inspectFile: async (key, identity) => {
    context = identity;
    return inspectedImage(key);
  } }).registerFile({ storageKey, role: "owner", subject: "forged" }), code("PERSISTENCE_FAILED"));
  assert.deepEqual(context, { subject: "qa-server-subject", role: "staff" });
  assert.equal(Object.isFrozen(context), true);
});

test("reference inputs require exact IDs/version and bounded literal text before DB access", async () => {
  const api = createMediaReferences({ db, resolveActor: actor });
  const input = { revisionId: randomUUID(), productId: randomUUID(), expectedVersion: 1,
    assetId: randomUUID(), altId: "", altEn: "", captionId: "", captionEn: "", sortOrder: 0 };
  for (const value of [null, {}, { ...input, expectedVersion: 2147483647 }, { ...input, assetId: "x" }]) {
    await assert.rejects(api.saveCatalog(value), code("INVALID_INPUT"));
  }
  await assert.rejects(api.savePage({ ...input, altEn: "x".repeat(501) }), code("INVALID_MEDIA"));
  await assert.rejects(api.savePage(input), code("PERSISTENCE_FAILED"));
});

