import test from "node:test";
import assert from "node:assert/strict";
import { ReportGuardError, resolveReportUrl, reportQueries, buildReport } from "../../scripts/lib/catalog-variants-report.mjs";

test("refuses every non-local host and malformed URL before connecting", () => {
  for (const url of ["postgres://u:p@db.example.com:5432/x", "postgres://u:p@10.0.0.5/x", "postgres://u:p@staging.internal/x", "postgres://u:p@127.0.0.2/x",
    "postgres://u:p@localhost.evil.test/x", "http://localhost/x", "not a url"]) {
    assert.throws(() => resolveReportUrl({ DATABASE_URL: url }), error => error instanceof ReportGuardError && !error.message.includes("p@"));
  }
  assert.throws(() => resolveReportUrl({}), ReportGuardError);
});
test("accepts localhost, 127.0.0.1 and ::1 without echoing the URL", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const url = `postgres://user:secret@${host}:5432/tiny_osaka_dev`;
    assert.equal(resolveReportUrl({ DATABASE_URL: url }), url);
  }
});
test("a remote CATALOG_REPORT_DATABASE_URL cannot be hidden behind a local DATABASE_URL", () => {
  assert.throws(() => resolveReportUrl({ CATALOG_REPORT_DATABASE_URL: "postgres://u:p@prod.example.com/x", DATABASE_URL: "postgres://u:p@localhost/x" }), ReportGuardError);
});
test("every report statement is a single SELECT", () => {
  for (const sql of Object.values(reportQueries)) {
    assert.match(sql.trim(), /^SELECT\b/i);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT)\b|;/i);
  }
});
test("the report runs inside a READ ONLY transaction that is always rolled back", async () => {
  const log = [];
  const client = { query: async sql => { log.push(sql.trim().split(/\s+/).slice(0, 3).join(" ")); return { rows: [] }; } };
  const report = await buildReport(client);
  assert.deepEqual(report.revisions, []);
  assert.equal(log[0], "BEGIN READ ONLY");
  assert.equal(log.at(-1), "ROLLBACK");
  assert.ok(log.slice(1, -1).every(entry => entry.startsWith("SELECT")));
});
test("report flags multi-variant and costed-modifier products", async () => {
  const rows = {
    [reportQueries.revisions]: [{ id: "r1", status: "published", version: 3, live: true }],
    [reportQueries.products]: [{ product_id: "p1", slug: "a", title: "A", category_slug: "menu" }, { product_id: "p2", slug: "b", title: "B", category_slug: "menu" }],
    [reportQueries.variants]: [{ product_id: "p1", code: "standard", base_price: "10000" }, { product_id: "p1", code: "large", base_price: "15000" }, { product_id: "p2", code: "standard", base_price: "9000" }],
    [reportQueries.groups]: [{ product_id: "p2", group_code: "extras", options: 2, max_price_delta: "3000", total_price_delta: "5000" }],
    [reportQueries.media]: [{ product_id: "p2", refs: 1 }], [reportQueries.categories]: [{ categories: 1 }],
  };
  const report = await buildReport({ query: async sql => ({ rows: rows[sql] ?? [] }) });
  const [revision] = report.revisions;
  assert.equal(revision.productCount, 2);
  assert.deepEqual(revision.multiVariantProducts.map(row => row.slug), ["a"]);
  assert.deepEqual(revision.productsWithModifiers.map(row => row.slug), ["b"]);
  assert.deepEqual(revision.productsWithMedia, [{ slug: "b", refs: 1 }]);
  assert.ok(!JSON.stringify(report).includes("postgres://"));
});
