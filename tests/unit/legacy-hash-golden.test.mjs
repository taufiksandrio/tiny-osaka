import assert from "node:assert/strict";
import test from "node:test";
import { catalogContentFields, hashCatalogContent } from "../../src/server/catalog/content-hash.mjs";
import { hashPageContent } from "../../src/server/pages/content-hash.mjs";
import { mediaRefFields } from "../../src/server/media/policy.mjs";

// Frozen snapshots written before the single-language change still carry English translation rows and
// alt/caption English columns. Their hashes are immutable evidence: these golden values were computed
// from the implementation that predates the removal of locale handling and must never change.
const ids = { revision: "00000000-0000-4000-8000-0000000000a1", asset: "00000000-0000-4000-8000-0000000000b1",
  ref: "00000000-0000-4000-8000-0000000000c1", product: "00000000-0000-4000-8000-0000000000d1" };
const asset = { id: ids.asset, kind: "image", storageKey: ids.asset + ".png", mime: "image/png", byteSize: 1000,
  width: 800, height: 600, durationMs: null, checksum: "a".repeat(64), externalId: null, posterId: null };
const ref = { revisionId: ids.revision, id: ids.ref, assetId: ids.asset, altId: "Gambar", altEn: "Image",
  captionId: "Takoyaki", captionEn: "Takoyaki EN", sortOrder: 0 };
const richField = text => ({ blocks: [{ type: "paragraph", content: [{ text }] }] });
const pageGraph = media => ({ page: { key: "about", template: "about" },
  revision: { id: ids.revision, pageKey: "about", version: 3 },
  translations: ["id", "en"].map(locale => ({ revisionId: ids.revision, locale,
    fields: { title: "Judul " + locale, body: richField("Isi " + locale) } })),
  ...(media ? { mediaRefs: [ref], mediaAssets: [asset] } : {}) });
const catalogGraph = media => {
  const graph = { revision: { id: ids.revision, version: 3 } };
  const numeric = ["sortOrder", "basePrice", "priceDelta", "minSelections", "maxSelections"];
  for (const [table, fields] of Object.entries(catalogContentFields)) {
    graph[table] = ["id", "en"].map((locale, n) => Object.fromEntries(fields.map(field =>
      [field, field === "locale" ? locale : numeric.includes(field) ? n : field + n])));
  }
  graph.productEntries = [{ ...graph.productEntries[0], revisionId: ids.revision, productId: ids.product }];
  return media ? { ...graph, mediaRefs: [{ ...ref, productId: ids.product }], mediaAssets: [asset] } : graph;
};

test("media reference hash fields still include the legacy English columns", () => {
  assert.deepEqual([...mediaRefFields], ["revisionId", "id", "assetId", "altId", "altEn", "captionId", "captionEn", "sortOrder"]);
  assert.ok(catalogContentFields.productTranslations.includes("locale"));
});

test("page hashes with id+en rows and English media text are unchanged", () => {
  assert.equal(hashPageContent(pageGraph(false)), "29724061126aafef13b2ffd3bcaa5a6c3cacd2b86d7fb225fe9d361e03f57414");
  assert.equal(hashPageContent(pageGraph(true)), "e189fc01f8d4744818e1b32c7f776c1c249ddf784cf50051c9fb70602dbf19b7");
});

test("catalog hashes with id+en rows and English media text are unchanged", () => {
  assert.equal(hashCatalogContent(catalogGraph(false)), "d84d065c2303be0fd44fbbf5806a536fa2cf8c22047964f5c3baa30d1b3700d1");
  assert.equal(hashCatalogContent(catalogGraph(true)), "2b3773c62697c3cd3b067195874a82548b9d7b3cc47852b21e6b319009e277fc");
});
