import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { getPublicDatabaseConfig } from "../../src/server/public/config.mjs";
import { readPublicCatalog, readPublicPage } from "../../src/server/public/data.mjs";
import { createPublicFixture, cleanupPublicFixture, emptyTracking, token, catalogWorkflow, pageWorkflow, assertEmptyTestDatabase } from "../fixtures/published-data.mjs";
import { pricingProduct, minimumPrice } from "../../src/server/public/view-models.mjs";
import { calculatePrice } from "../../src/server/catalog/pricing.mjs";
import { fields } from "../fixtures/page-content.mjs";

test("application reader exposes exact published content with no table or draft privileges", async () => {
  const owner = await connectTestOwner();
  const app = new pg.Client(getPublicDatabaseConfig({ ...process.env, PUBLIC_DATABASE_TARGET: "test" }));
  const tracked = emptyTracking();
  try {
    await app.connect();
    assert.equal(await readPublicCatalog(app, "id"), null);
    assert.equal(await readPublicPage(app, "about", "id"), null);
    const fixture = await createPublicFixture(owner, tracked);
    assert.equal(await readPublicCatalog(app, "id"), null, "approved catalog remains private");
    await assert.rejects(app.query("SELECT * FROM public.page_revisions"), error => error.code === "42501");
    await assert.rejects(app.query("UPDATE public.catalog_publication SET content_hash='x'"), error => error.code === "42501");
    await assert.rejects(app.query("SET ROLE tiny_osaka_test_owner"), error => error.code === "42501");
    await catalogWorkflow(drizzle(owner)).publish(token(fixture.approved));
    await app.query("SET search_path=pg_temp");
    for (const locale of ["id", "en"]) {
      const catalog = await readPublicCatalog(app, locale);
      assert.equal(catalog.products[0].title, `QA Product ${locale}`);
      assert.equal(catalog.categories[0].title, `QA Category ${locale}`);
      assert.equal(minimumPrice(pricingProduct(catalog, catalog.products[0])), 400000);
      assert.equal(catalog.media[0].alt, locale === "id" ? "QA gambar" : "QA image");
      assert.equal(calculatePrice(pricingProduct(catalog, catalog.products[0]), {
        revisionId: catalog.revision.id, productId: fixture.productId, optionIds: [fixture.optionId],
      }), 400000);
      const page = await readPublicPage(app, "about", locale);
      assert.equal(page.fields.title, `QA about ${locale}`);
      assert.equal(page.media[0].asset.kind, "youtube");
      assert.equal(page.media[0].poster.kind, "image");
      for (const secret of ["contentHash", "storageKey", "checksum", "approvedBy", "qa-public-owner"]) {
        assert.ok(!JSON.stringify({ catalog, page }).includes(secret));
      }
    }
    const wf = pageWorkflow(drizzle(owner));
    const draft = await wf.createDraft({ pageKey: "about" }); tracked.pageRevisions.push(draft.id);
    let saved;
    for (const [i, locale] of ["id", "en"].entries()) saved = await wf.saveTranslation({ revisionId: draft.id, expectedVersion: i + 1, locale,
      fields: { ...fields("about"), title: `Replacement ${locale}` } });
    const approved = await wf.approve(token(await wf.submit({ revisionId: draft.id, expectedVersion: saved.version })));
    assert.equal((await readPublicPage(app, "about", "id")).fields.title, "QA about id");
    await wf.publish(token(approved));
    assert.equal((await readPublicPage(app, "about", "id")).fields.title, "Replacement id", "fresh query sees replacement");
    assert.equal(await readPublicCatalog(app, "xx"), null);
    assert.equal(await readPublicPage(app, "about');DROP TABLE pages;--", "id"), null);
    assert.equal((await app.query("SELECT public.public_read_page($1,$2) AS value", ["unknown", "id"])).rows[0].value, null);
  } finally {
    await app.end();
    try { await cleanupPublicFixture(owner, tracked); await assertEmptyTestDatabase(owner); } finally { await owner.end(); }
  }
});
