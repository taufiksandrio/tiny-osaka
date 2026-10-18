import assert from "node:assert/strict";
import test from "node:test";
import { catalogContentFields, hashCatalogContent } from "../../src/server/catalog/content-hash.mjs";

const graph = () => ({
  revision: { id: "revision", version: 1, status: "draft" },
  ...Object.fromEntries(Object.entries(catalogContentFields).map(([table, fields]) =>
    [table, [1, 2].map(n => Object.fromEntries(fields.map(field => [field, field + n])))])),
});

// Order links (migration 0015) must not change the hash of any snapshot that has no link.
test("snapshots without order links keep their pre-0015 hash; any link changes it", () => {
  const fixed = { revision: { id: "00000000-0000-4000-8000-000000000001", version: 3, status: "published" } };
  const numeric = ["sortOrder", "basePrice", "priceDelta", "minSelections", "maxSelections"];
  for (const [table, fields] of Object.entries(catalogContentFields)) {
    fixed[table] = [1, 2].map(n => Object.fromEntries(fields.map(field => [field, numeric.includes(field) ? n : field + n])));
  }
  // Pinned digest produced by the content-hash implementation that predates the link columns.
  const legacy = "779e1b848adef17ad5caf4149408b4ddf601599017f6167448aaa31a47344b7d";
  assert.equal(hashCatalogContent(fixed), legacy);
  const nulls = structuredClone(fixed);
  for (const row of nulls.productEntries) Object.assign(row, { grabfoodUrl: null, gofoodUrl: null, shopeefoodUrl: null });
  assert.equal(hashCatalogContent(nulls), legacy);
  const seen = new Set([legacy]);
  for (const key of ["grabfoodUrl", "gofoodUrl", "shopeefoodUrl"]) {
    const linked = structuredClone(nulls); linked.productEntries[0][key] = "https://a.example/x";
    const digest = hashCatalogContent(linked);
    assert.ok(!seen.has(digest), key); seen.add(digest);
    linked.productEntries[0][key] = "https://a.example/y";
    assert.ok(!seen.has(hashCatalogContent(linked)), key + " value");
  }
});

test("hash is deterministic across row order, property order and workflow metadata", () => {
  const a = graph(), b = structuredClone(a);
  b.revision.status = "published"; b.revision.contentHash = "ignored"; b.revision.createdAt = new Date();
  for (const table of Object.keys(catalogContentFields)) b[table] = b[table].reverse()
    .map(row => Object.fromEntries(Object.entries(row).reverse()));
  assert.equal(hashCatalogContent(a), hashCatalogContent(b));
  assert.match(hashCatalogContent(a), /^[0-9a-f]{64}$/);
});

test("every approved content column, revision and version affects the hash", () => {
  const original = graph(), expected = hashCatalogContent(original);
  for (const [table, fields] of Object.entries(catalogContentFields)) {
    for (const field of fields) {
      const changed = structuredClone(original); changed[table][0][field] += "-changed";
      assert.notEqual(hashCatalogContent(changed), expected, table + "." + field);
    }
  }
  for (const key of ["id", "version"]) {
    const changed = structuredClone(original); changed.revision[key] += 1;
    assert.notEqual(hashCatalogContent(changed), expected);
  }
});

test("row omission and duplicate rows affect the hash; missing tables and fields fail closed", () => {
  const original = graph(), expected = hashCatalogContent(original);
  for (const [table, fields] of Object.entries(catalogContentFields)) {
    const missingRow = structuredClone(original); missingRow[table].pop();
    assert.notEqual(hashCatalogContent(missingRow), expected);
    const duplicate = structuredClone(original); duplicate[table].push(duplicate[table][0]);
    assert.notEqual(hashCatalogContent(duplicate), expected);
    const missingTable = structuredClone(original); delete missingTable[table];
    assert.throws(() => hashCatalogContent(missingTable));
    const missingField = structuredClone(original); delete missingField[table][0][fields[0]];
    assert.throws(() => hashCatalogContent(missingField));
  }
});

