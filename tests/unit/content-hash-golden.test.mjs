import assert from "node:assert/strict";
import test from "node:test";
import { catalogContentFields, hashCatalogContent } from "../../src/server/catalog/content-hash.mjs";
import { hashPageContent } from "../../src/server/pages/content-hash.mjs";
import { mediaRefFields } from "../../src/server/media/policy.mjs";

// ADR-039: hashes are computed from rows without any language column. These golden values lock the
// format introduced by migration 0016; an accidental change would invalidate every stored snapshot.
const ids = { revision: "00000000-0000-4000-8000-0000000000a1", asset: "00000000-0000-4000-8000-0000000000b1",
  ref: "00000000-0000-4000-8000-0000000000c1", product: "00000000-0000-4000-8000-0000000000d1" };
const asset = { id: ids.asset, kind: "image", storageKey: ids.asset + ".png", mime: "image/png", byteSize: 1000,
  width: 800, height: 600, durationMs: null, checksum: "a".repeat(64), externalId: null, posterId: null };
const ref = { revisionId: ids.revision, id: ids.ref, assetId: ids.asset, altId: "Gambar", captionId: "Takoyaki", sortOrder: 0 };
const richField = text => ({ blocks: [{ type: "paragraph", content: [{ text }] }] });
const pageGraph = media => ({ page: { key: "about", template: "about" },
  revision: { id: ids.revision, pageKey: "about", version: 3 },
  translations: [{ revisionId: ids.revision, fields: { title: "Judul", body: richField("Isi") } }],
  ...(media ? { mediaRefs: [ref], mediaAssets: [asset] } : {}) });
const catalogGraph = media => {
  const graph = { revision: { id: ids.revision, version: 3 } };
  const numeric = ["sortOrder", "basePrice", "priceDelta", "minSelections", "maxSelections"];
  for (const [table, fields] of Object.entries(catalogContentFields)) {
    graph[table] = [0, 1].map(n => Object.fromEntries(fields.map(field => [field, numeric.includes(field) ? n : field + n])));
  }
  graph.productEntries = [{ ...graph.productEntries[0], revisionId: ids.revision, productId: ids.product }];
  return media ? { ...graph, mediaRefs: [{ ...ref, productId: ids.product }], mediaAssets: [asset] } : graph;
};

test("hash inputs carry no language fields", () => {
  assert.deepEqual([...mediaRefFields], ["revisionId", "id", "assetId", "altId", "captionId", "sortOrder"]);
  assert.deepEqual(catalogContentFields.productTranslations, ["revisionId", "productId", "title", "description"]);
});

test("page hash golden values", () => {
  assert.equal(hashPageContent(pageGraph(false)), "6f2cbc37d50eec3ed34e41daabb5aaca5f9878f081792ee07e96b7239c81b689");
  assert.equal(hashPageContent(pageGraph(true)), "9aa43fc43eecebae4652a38a043431ea74c6da9a5bc8e2367601adb8ef07ecd8");
});

test("catalog hash golden values", () => {
  assert.equal(hashCatalogContent(catalogGraph(false)), "89f7c21819236254e134bf30bbba85a21725274424fd65da39a6c849da4f68bc");
  assert.equal(hashCatalogContent(catalogGraph(true)), "0bd884cbb3ed7f3282ec84ef359728a0688552580b98d2989d6b588bc7c04e6e");
});
