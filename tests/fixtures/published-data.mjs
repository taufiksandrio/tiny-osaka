import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as catalog from "../../src/server/catalog/drafts.mjs";
import { createCatalogWorkflow } from "../../src/server/catalog/workflow.mjs";
import { createPageWorkflow } from "../../src/server/pages/workflow.mjs";
import { allTables } from "../../scripts/lib/test-migration-plan.mjs";
import { verifyCatalogProtection } from "../../scripts/lib/catalog-protection.mjs";
import { verifyPageProtection } from "../../scripts/lib/page-protection.mjs";
import { verifyMediaProtection } from "../../scripts/lib/media-protection.mjs";
import { verifyPublicReadProtection } from "../../scripts/lib/public-read-protection.mjs";
import { pageDefinitions } from "../../src/server/pages/templates.mjs";
import { fields, rich } from "./page-content.mjs";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { storageRoot } from "../../src/server/media/storage.mjs";
import { verifyPublishingProtection } from "../../scripts/lib/publishing-protection.mjs";
import { createMediaAssets } from "../../src/server/media/assets.mjs";
import { createMediaReferences } from "../../src/server/media/references.mjs";

export const token = row => ({ revisionId: row.revisionId ?? row.id, expectedVersion: row.version, expectedHash: row.contentHash });
const resolveActor = async () => ({ subject: "qa-public-owner", role: "owner" });
export const catalogWorkflow = db => createCatalogWorkflow({ db, resolveActor });
export const pageWorkflow = db => createPageWorkflow({ db, resolveActor });
export const emptyTracking = () => ({ revisions: [], categories: [], products: [], pageRevisions: [], pages: [], assets: [], files: [] });
// Real 1600x1200 PNG in the test media root: /media/<id> serves a file whose size and SHA-256 match the media row.
const writeQaImage = async tracked => {
  const storageKey = randomUUID() + ".png";
  const bytes = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 196, g: 98, b: 52 } } }).png().toBuffer();
  const root = storageRoot({ PUBLIC_DATABASE_TARGET: "test" });
  await mkdir(root, { recursive: true });
  const file = path.join(root, storageKey);
  tracked.files.push(file);
  await writeFile(file, bytes, { flag: "wx" });
  return { storageKey, mime: "image/png", byteSize: bytes.length, width: 1600, height: 1200, durationMs: null, verified: true,
    checksum: createHash("sha256").update(bytes).digest("hex") };
};

export const assertEmptyTestDatabase = async client => {
  for (const table of allTables) assert.equal(Number((await client.query(`SELECT count(*) FROM public.${table}`)).rows[0].count), 0, table);
};
// orderLinks (optional): { grabfoodUrl, gofoodUrl, shopeefoodUrl } written to the DRAFT product entry before submit.
export const createPublicFixture = async (client, tracked, { orderLinks = null } = {}) => {
  await client.query("SELECT pg_advisory_lock(76210986)");
  await assertEmptyTestDatabase(client);
  return drizzle(client).transaction(async db => {
    const assets = createMediaAssets({ db, resolveActor, inspectFile: async key => ({ ...stored, storageKey: key }) });
    const stored = await writeQaImage(tracked);
    const image = await assets.registerFile({ storageKey: stored.storageKey }); tracked.assets.push(image.id);
    const youtube = await assets.registerYoutube({ videoId: "Abc_123-xyz", posterId: image.id }); tracked.assets.push(youtube.id);
    const refs = createMediaReferences({ db, resolveActor });
    const mediaText = { altId: "QA gambar", captionId: "QA keterangan", sortOrder: 0 };
    const revision = await catalog.createCatalogDraft(db);
    tracked.revisions.push(revision.id);
    let version = 1;
    const category = await catalog.createCatalogCategory(db, { revisionId: revision.id, expectedVersion: version++, slug: "qa-category-" + randomUUID(), sortOrder: 0 });
    tracked.categories.push(category.categoryId);
    const slug = "qa-product-" + randomUUID();
    const product = await catalog.createCatalogProduct(db, { revisionId: revision.id, expectedVersion: version++, categoryId: category.categoryId, slug, sortOrder: 0 });
    tracked.products.push(product.productId);
    const scope = { revisionId: revision.id, productId: product.productId };
    const variant = await catalog.createProductVariant(db, { ...scope, expectedVersion: version++, code: "standard", basePrice: 250000, sortOrder: 0 });
    const group = await catalog.createModifierGroup(db, { ...scope, expectedVersion: version++, code: "extras", selectionType: "single", minSelections: 1, maxSelections: 1, sortOrder: 0 });
    const option = await catalog.createModifierOption(db, { ...scope, expectedVersion: version++, groupId: group.groupId, code: "extra", priceDelta: 150000, sortOrder: 0 });
    for (const [save, input, title] of [
      [catalog.saveCategoryTranslation, { revisionId: revision.id, categoryId: category.categoryId }, "Category"],
      [catalog.saveProductTranslation, scope, "Product"],
      [catalog.saveVariantTranslation, { ...scope, variantId: variant.variantId }, "Standard"],
      [catalog.saveModifierGroupTranslation, { ...scope, groupId: group.groupId }, "Extras"],
      [catalog.saveModifierOptionTranslation, { ...scope, groupId: group.groupId, optionId: option.optionId }, "Extra"],
    ]) await save(db, { ...input, expectedVersion: version++, title: `QA ${title}`, description: "QA synthetic" });
    await refs.saveCatalog({ ...scope, expectedVersion: version++, assetId: image.id, ...mediaText });
    if (orderLinks) {
      await db.execute(sql`UPDATE public.product_entries SET grabfood_url = ${orderLinks.grabfoodUrl ?? null}, gofood_url = ${orderLinks.gofoodUrl ?? null},
        shopeefood_url = ${orderLinks.shopeefoodUrl ?? null} WHERE revision_id = ${revision.id} AND product_id = ${product.productId}`);
    }
    const approved = await catalogWorkflow(db).approve(token(await catalogWorkflow(db).submit({ revisionId: revision.id, expectedVersion: version })));
    for (const key of Object.keys(pageDefinitions)) {
      const wf = pageWorkflow(db);
      const page = await wf.createDraft({ pageKey: key });
      tracked.pages.push(key); tracked.pageRevisions.push(page.id);
      const data = fields(key);
      data.title = `QA ${key}`; data.seoTitle = data.title;
      data.body = rich("QA body <script>literal only</script>");
      let saved = await wf.saveTranslation({ revisionId: page.id, expectedVersion: 1, fields: data });
      if (key === "about") saved = await refs.savePage({ revisionId: page.id, expectedVersion: saved.version, assetId: youtube.id, ...mediaText });
      // The home hero renders only from CMS media (HomeContent), so the home page gets the image as well.
      if (key === "home") saved = await refs.savePage({ revisionId: page.id, expectedVersion: saved.version, assetId: image.id, altId: "QA gambar", captionId: "Takoyaki Shio Negi · Tiny Osaka", sortOrder: 0 });
      const ready = await wf.approve(token(await wf.submit({ revisionId: page.id, expectedVersion: saved.version })));
      await wf.publish(token(ready));
    }
    return { approved, slug, productId: product.productId, optionId: option.optionId };
  });
};

// Only exact IDs created above are removed, inside one transaction. Disabling
// immutable-row guards is limited to the test owner and reverted before commit.
export const cleanupPublicFixture = async (client, tracked) => {
  if (Object.values(tracked).every(ids => ids.length === 0)) return;
  await client.query("BEGIN");
  try {
    await client.query(`LOCK TABLE ${allTables.map(table => "public." + table).join(",")} IN ACCESS EXCLUSIVE MODE`);
    for (const table of allTables) await client.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
    await client.query("DELETE FROM public.publication_events WHERE job_id IN (SELECT id FROM public.publication_jobs WHERE page_revision_id=ANY($1::uuid[]) OR catalog_revision_id=ANY($2::uuid[]))", [tracked.pageRevisions, tracked.revisions]);
    await client.query("DELETE FROM public.publication_jobs WHERE page_revision_id=ANY($1::uuid[]) OR catalog_revision_id=ANY($2::uuid[])", [tracked.pageRevisions, tracked.revisions]);
    for (const table of ["catalog_media_refs", "catalog_publication", "catalog_workflow_events", "catalog_approvals", "catalog_submissions",
      "modifier_option_translations", "modifier_options", "modifier_group_translations", "modifier_groups", "variant_translations",
      "product_variants", "product_translations", "product_entries", "category_translations", "category_entries"]) {
      await client.query(`DELETE FROM public.${table} WHERE revision_id=ANY($1::uuid[])`, [tracked.revisions]);
    }
    await client.query("DELETE FROM public.catalog_revisions WHERE id=ANY($1::uuid[])", [tracked.revisions]);
    for (const [table, ids] of [["products", tracked.products], ["categories", tracked.categories]]) {
      await client.query(`DELETE FROM public.${table} WHERE id=ANY($1::uuid[])`, [ids]);
    }
    for (const table of ["page_media_refs", "page_publications", "page_workflow_events", "page_approvals", "page_submissions", "page_translations"]) {
      await client.query(`DELETE FROM public.${table} WHERE revision_id=ANY($1::uuid[])`, [tracked.pageRevisions]);
    }
    await client.query("DELETE FROM public.page_revisions WHERE id=ANY($1::uuid[])", [tracked.pageRevisions]);
    await client.query("DELETE FROM public.pages WHERE key=ANY($1::text[])", [tracked.pages]);
    await client.query("DELETE FROM public.media_events WHERE asset_id=ANY($1::uuid[])", [tracked.assets]);
    for (const id of [...tracked.assets].reverse()) await client.query("DELETE FROM public.media_assets WHERE id=$1", [id]);
    for (const table of allTables) await client.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
    const owner = "tiny_osaka_test_owner";
    await verifyCatalogProtection(client, owner); await verifyPageProtection(client, owner);
    await verifyMediaProtection(client, owner); await verifyPublicReadProtection(client, owner, { orderLinks: true });
    await verifyPublishingProtection(client, owner);
    await client.query("COMMIT");
    for (const file of tracked.files) await rm(file, { force: true });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
};
