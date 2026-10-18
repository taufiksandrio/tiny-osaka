import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { cmsFail } from "../cms/request-policy.mjs";
import { publishingLock } from "../publishing/locks.mjs";
import * as drafts from "./drafts.mjs";
import { CatalogDraftError } from "./drafts.mjs";
import { loadCatalogGraph } from "./review.mjs";
import { validateCatalogReviewReadiness } from "./review-readiness.mjs";
import { hashCatalogContent } from "./content-hash.mjs";
import { slugify, slugCandidate } from "./product-input.mjs";
import { ORDER_LINK_KEYS } from "./order-links.mjs";

// Catalog card service (ADR-037). Every write builds a complete replacement snapshot, publishes
// it in the same transaction and never calls a merchant endpoint. Callers hold an authenticated,
// DB-verified actor; Owner-only checks for delete are enforced by the CMS service wrapper.
const INTERNAL_CATEGORY = "menu";
const MAX_ATTEMPTS = 60;

export const lockCatalogWrites = async tx => {
  // Same order as approve/publish: global publishing lock, then the catalog lock.
  await publishingLock(tx);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(76210984)`);
};

const loadLive = async tx => {
  const [pointer] = await tx.select().from(s.catalogPublication).where(eq(s.catalogPublication.id, 1));
  if (!pointer) return null;
  const [revision] = await tx.select().from(s.catalogRevisions).where(eq(s.catalogRevisions.id, pointer.revisionId));
  return revision ? { pointer, revision } : null;
};

// The version token covers only what the editor can change, so concurrent edits of
// different cards never conflict and an identical re-save is recognised as a no-op.
export const productVersion = card => createHash("sha256")
  .update(JSON.stringify([card.slug, card.name, card.description, card.price, card.image?.assetId ?? null, card.image?.alt ?? "",
    ...ORDER_LINK_KEYS.map(key => card[key] ?? null)])).digest("hex");

// One shared price per product. Stage 1 keeps the hidden `standard` variant as the source.
const priceOf = variants => {
  const standard = variants.find(row => row.code === "standard");
  if (standard) return standard.basePrice;
  return variants.length ? Math.min(...variants.map(row => row.basePrice)) : 0;
};

export const buildCards = graph => {
  const cards = graph.productEntries.map(entry => {
    const identity = graph.products.find(row => row.id === entry.productId);
    const translation = graph.productTranslations.find(row => row.productId === entry.productId && row.locale === "id");
    const ref = graph.mediaRefs.filter(row => row.productId === entry.productId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))[0];
    const asset = ref ? graph.mediaAssets.find(row => row.id === ref.assetId) : null;
    // Videos and YouTube entries are shown through their image poster.
    const imageId = asset ? (asset.kind === "image" ? asset.id : asset.posterId) : null;
    const card = { id: entry.productId, slug: identity.slug, name: translation?.title ?? identity.slug, description: translation?.description ?? "",
      price: priceOf(graph.productVariants.filter(row => row.productId === entry.productId)), sortOrder: entry.sortOrder,
      image: imageId ? { assetId: imageId, alt: ref.altId } : null,
      ...Object.fromEntries(ORDER_LINK_KEYS.map(key => [key, entry[key] ?? null])) };
    return { ...card, version: productVersion(card) };
  });
  // Newest first: sort_order is a monotonic counter assigned at creation; slug breaks legacy ties.
  return cards.sort((a, b) => b.sortOrder - a.sortOrder || a.slug.localeCompare(b.slug));
};

export const readCards = async tx => {
  const live = await loadLive(tx);
  if (!live) return { products: [], updatedAt: null };
  const graph = await loadCatalogGraph(tx, live.revision);
  return { products: buildCards(graph).map(({ id: _id, ...card }) => card), updatedAt: live.pointer.publishedAt.toISOString() };
};

const findCard = (graph, slug) => {
  const card = buildCards(graph).find(row => row.slug === slug);
  if (!card) cmsFail("NOT_FOUND", 404);
  return card;
};

const publicDto = ({ id: _id, ...card }) => card;

// Hidden structure kept until stage 2: one internal category, one `standard` variant per product.
const ensureCategory = async (tx, draft, version) => {
  const [existing] = await tx.select({ id: s.categoryEntries.categoryId }).from(s.categoryEntries)
    .where(eq(s.categoryEntries.revisionId, draft.id)).orderBy(asc(s.categoryEntries.sortOrder), asc(s.categoryEntries.categoryId)).limit(1);
  if (existing) return { categoryId: existing.id, version };
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    try {
      const created = await drafts.createCatalogCategory(tx, { revisionId: draft.id, expectedVersion: version,
        slug: slugCandidate(INTERNAL_CATEGORY, n), sortOrder: 0 });
      const titled = await drafts.saveCategoryTranslation(tx, { revisionId: draft.id, expectedVersion: created.version,
        categoryId: created.categoryId, locale: "id", title: "Menu", description: "" });
      return { categoryId: created.categoryId, version: titled.version };
    } catch (error) {
      if (!(error instanceof CatalogDraftError) || error.code !== "SLUG_CONFLICT") throw error;
    }
  }
  cmsFail("CATALOG_UNAVAILABLE", 503);
};

// Readiness requires a translated variant, so the hidden `standard` variant gets a fixed label.
const addStandardVariant = async (tx, draftId, version, productId, price) => {
  const variant = await drafts.createProductVariant(tx, { revisionId: draftId, expectedVersion: version, productId,
    code: "standard", basePrice: price, sortOrder: 0 });
  return drafts.saveVariantTranslation(tx, { revisionId: draftId, expectedVersion: variant.version, productId,
    variantId: variant.variantId, locale: "id", title: "Standar", description: "" });
};

// Submit, approve and publish as one immutable, hash-checked snapshot. The real actor is
// recorded on every receipt; this mirrors the direct page editor (ADR-036).
const publishDraft = async (tx, actor, draftId, action, { allowEmpty = false } = {}) => {
  const [saved] = await tx.select().from(s.catalogRevisions).where(eq(s.catalogRevisions.id, draftId));
  const graph = await loadCatalogGraph(tx, saved);
  if (!validateCatalogReviewReadiness(graph, { allowEmpty }).ready) throw new CatalogDraftError("NOT_READY", "Catalog snapshot is incomplete.");
  const contentHash = hashCatalogContent(graph);
  await tx.insert(s.catalogSubmissions).values({ revisionId: saved.id, version: saved.version, contentHash, submittedBy: actor.subject });
  await tx.update(s.catalogRevisions).set({ status: "review", contentHash }).where(eq(s.catalogRevisions.id, saved.id));
  await tx.insert(s.catalogApprovals).values({ revisionId: saved.id, contentHash, approvedBy: actor.subject });
  await tx.update(s.catalogRevisions).set({ status: "approved" }).where(eq(s.catalogRevisions.id, saved.id));
  await tx.update(s.catalogRevisions).set({ status: "published" }).where(eq(s.catalogRevisions.id, saved.id));
  await tx.insert(s.catalogPublication).values({ id: 1, revisionId: saved.id, contentHash })
    .onConflictDoUpdate({ target: s.catalogPublication.id, set: { revisionId: saved.id, contentHash, publishedAt: sql`now()` } });
  await tx.insert(s.catalogWorkflowEvents).values([action, "submit", "approve", "publish"]
    .map(name => ({ revisionId: saved.id, action: name, actorId: actor.subject })));
  return saved;
};

// The asset must be a registered still image (videos/YouTube cannot be card images). Checked in the
// write transaction; assets are immutable and cannot be deleted by CMS roles.
const assertImageAsset = async (tx, assetId) => {
  const [asset] = await tx.select({ id: s.mediaAssets.id, kind: s.mediaAssets.kind }).from(s.mediaAssets).where(eq(s.mediaAssets.id, assetId));
  if (!asset) cmsFail("IMAGE_NOT_FOUND");
  if (asset.kind !== "image") cmsFail("INVALID_IMAGE");
};

const bumpDraft = (tx, draftId) => tx.update(s.catalogRevisions).set({ version: sql`version + 1` }).where(eq(s.catalogRevisions.id, draftId));

// Draft-only writes (same bump pattern as src/server/media/references.mjs). Runs last so the
// version chain used by the drafts helpers is not disturbed.
const applyImage = async (tx, draftId, productId, image) => {
  const scope = and(eq(s.catalogMediaRefs.revisionId, draftId), eq(s.catalogMediaRefs.productId, productId));
  if (image.mode === "alt") {
    await tx.update(s.catalogMediaRefs).set({ altId: image.alt }).where(scope);
  } else {
    await tx.delete(s.catalogMediaRefs).where(scope);
    if (image.mode === "set") {
      await tx.insert(s.catalogMediaRefs).values({ revisionId: draftId, productId, assetId: image.assetId, altId: image.alt,
        altEn: "", captionId: "", captionEn: "", sortOrder: 0 });
    }
  }
  await bumpDraft(tx, draftId);
};

// Order links live on the draft's product_entries row (stored only; saving never syncs or contacts a platform).
const applyOrderLinks = async (tx, draftId, productId, links) => {
  await tx.update(s.productEntries).set(links)
    .where(and(eq(s.productEntries.revisionId, draftId), eq(s.productEntries.productId, productId)));
  await bumpDraft(tx, draftId);
};

const cloneLive = async (tx, live, excludeProductId) => drafts.cloneCatalogDraft(tx, { sourceRevisionId: live.revision.id,
  expectedSourceVersion: live.revision.version, ...(excludeProductId ? { excludeProductId } : {}) });

export const createProduct = async (tx, actor, input) => {
  await lockCatalogWrites(tx);
  const base = slugify(input.name);
  if (!base) cmsFail("INVALID_SLUG");
  // On create, "alt" without an image and "clear" mean there is nothing to attach.
  if (input.image?.mode === "alt") cmsFail("IMAGE_REQUIRED");
  const image = input.image?.mode === "set" ? input.image : null;
  if (image) await assertImageAsset(tx, image.assetId);
  const live = await loadLive(tx);
  const draft = live ? await cloneLive(tx, live) : await drafts.createCatalogDraft(tx);
  const { categoryId, version: afterCategory } = await ensureCategory(tx, draft, draft.version);
  const [{ top }] = await tx.select({ top: sql`coalesce(max(${s.productEntries.sortOrder}), -1)`.mapWith(Number) })
    .from(s.productEntries).where(eq(s.productEntries.revisionId, draft.id));
  let created;
  for (let n = 1; n <= MAX_ATTEMPTS && !created; n++) {
    try {
      created = await drafts.createCatalogProduct(tx, { revisionId: draft.id, expectedVersion: afterCategory, categoryId,
        slug: slugCandidate(base, n), sortOrder: top + 1 });
    } catch (error) {
      if (!(error instanceof CatalogDraftError) || error.code !== "SLUG_CONFLICT") throw error;
    }
  }
  if (!created) cmsFail("SLUG_CONFLICT", 409);
  const titled = await drafts.saveProductTranslation(tx, { revisionId: draft.id, expectedVersion: created.version,
    productId: created.productId, locale: "id", title: input.name, description: input.description });
  await addStandardVariant(tx, draft.id, titled.version, created.productId, input.price);
  if (image) await applyImage(tx, draft.id, created.productId, image);
  // A new card has no links yet, so null means "nothing to store".
  const links = Object.fromEntries(Object.entries(input.orderLinks ?? {}).filter(([, value]) => value !== null));
  if (Object.keys(links).length) await applyOrderLinks(tx, draft.id, created.productId, links);
  const saved = await publishDraft(tx, actor, draft.id, "create");
  return publicDto(findCard(await loadCatalogGraph(tx, saved), created.slug));
};

export const updateProduct = async (tx, actor, slug, input) => {
  await lockCatalogWrites(tx);
  const live = await loadLive(tx);
  if (!live) cmsFail("NOT_FOUND", 404);
  const current = findCard(await loadCatalogGraph(tx, live.revision), slug);
  // Compare-and-set under the catalog lock: a stale editor never overwrites a newer save.
  if (input.expectedVersion !== current.version) cmsFail("PRODUCT_CONFLICT", 409);
  // Resolve the requested image change against the live card (AC-20 a-f).
  let image = null;
  if (input.image?.mode === "set") {
    await assertImageAsset(tx, input.image.assetId);
    image = input.image;
  } else if (input.image?.mode === "alt") {
    if (!current.image) cmsFail("IMAGE_REQUIRED");
    image = input.image;
  } else if (input.image?.mode === "clear" && current.image) image = input.image;
  const sameImage = !image || (image.mode === "set" ? image.assetId === current.image?.assetId && image.alt === current.image?.alt
    : image.mode === "alt" && image.alt === current.image.alt);
  // Only the keys that were sent AND differ from the stored value count as a change (absent key = keep).
  const links = Object.fromEntries(Object.entries(input.orderLinks ?? {}).filter(([key, value]) => value !== current[key]));
  const sameLinks = Object.keys(links).length === 0;
  if (input.name === current.name && input.description === current.description && input.price === current.price && sameImage && sameLinks) return publicDto(current);
  const draft = await cloneLive(tx, live);
  const titled = await drafts.saveProductTranslation(tx, { revisionId: draft.id, expectedVersion: draft.version,
    productId: current.id, locale: "id", title: input.name, description: input.description });
  const variants = await tx.select().from(s.productVariants)
    .where(and(eq(s.productVariants.revisionId, draft.id), eq(s.productVariants.productId, current.id)));
  const target = variants.find(row => row.code === "standard") ?? variants[0];
  if (target) {
    await drafts.updateVariantPrice(tx, { revisionId: draft.id, expectedVersion: titled.version, productId: current.id,
      variantId: target.id, basePrice: input.price });
  } else {
    await addStandardVariant(tx, draft.id, titled.version, current.id, input.price);
  }
  if (image && !sameImage) await applyImage(tx, draft.id, current.id, image);
  if (!sameLinks) await applyOrderLinks(tx, draft.id, current.id, links);
  const saved = await publishDraft(tx, actor, draft.id, "save");
  return publicDto(findCard(await loadCatalogGraph(tx, saved), slug));
};

// Hard delete (Opsi A1): publish a snapshot without the product, then purge everything else
// through the guarded SECURITY DEFINER function. One transaction: any failure rolls back fully
// and the previous live catalog stays intact.
export const deleteProduct = async (tx, actor, slug) => {
  await lockCatalogWrites(tx);
  const live = await loadLive(tx);
  if (!live) cmsFail("NOT_FOUND", 404);
  const current = findCard(await loadCatalogGraph(tx, live.revision), slug);
  const draft = await cloneLive(tx, live, current.id);
  const saved = await publishDraft(tx, actor, draft.id, "delete", { allowEmpty: true });
  // Deferred receipt checks must run before the purge function alters those tables.
  await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
  const [{ result }] = (await tx.execute(sql`SELECT public.catalog_purge_product(${current.id}::uuid, ${actor.subject}::text) AS result`)).rows;
  // Restore deferral: later receipts in this transaction must be checked at commit, not per statement.
  await tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);
  return { slug: result.slug, name: result.name, revisionId: saved.id };
};
