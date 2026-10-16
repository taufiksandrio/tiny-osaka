import "server-only";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.mjs";
import { CatalogDraftError } from "./drafts.mjs";
import { catalogReviewTables, validateCatalogReviewReadiness } from "./review-readiness.mjs";
import { loadRevisionMedia } from "../media/references.mjs";

// Caller holds the root lock (or reads an immutable published revision).
export const loadCatalogGraph = async (tx, revision) => {
  const graph = { revision };
  for (const name of catalogReviewTables) {
    graph[name] = await tx.select().from(schema[name]).where(eq(schema[name].revisionId, revision.id));
  }
  graph.categories = await tx.select({ id: schema.categories.id, slug: schema.categories.slug }).from(schema.categories)
    .innerJoin(schema.categoryEntries, eq(schema.categoryEntries.categoryId, schema.categories.id))
    .where(eq(schema.categoryEntries.revisionId, revision.id));
  graph.products = await tx.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products)
    .innerJoin(schema.productEntries, eq(schema.productEntries.productId, schema.products.id))
    .where(eq(schema.productEntries.revisionId, revision.id));
  return { ...graph, ...await loadRevisionMedia(tx, revision.id, "catalog") };
};

export const getCatalogReviewReadiness = async (db, input) => {
  if (!input || typeof input.revisionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.revisionId) ||
    !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion > 2147483647) {
    throw new CatalogDraftError("INVALID_INPUT", "Require a valid draft revision and source version.");
  }
  const { revisionId, expectedVersion } = input;
  try {
    return await db.transaction(async tx => {
      const [revision] = await tx.select().from(schema.catalogRevisions)
        .where(and(eq(schema.catalogRevisions.id, revisionId), eq(schema.catalogRevisions.status, "draft"),
          eq(schema.catalogRevisions.version, expectedVersion))).for("share");
      if (!revision) throw new CatalogDraftError("REVISION_CONFLICT", "Draft changed or is unavailable; reload before checking readiness.");
      // No DML: row-locking SELECT needs a normal transaction, not READ ONLY.
      const graph = await loadCatalogGraph(tx, revision);
      return validateCatalogReviewReadiness(graph);
    });
  } catch (error) {
    if (error instanceof CatalogDraftError) throw error;
    throw new CatalogDraftError("PERSISTENCE_FAILED", "Catalog readiness read failed.");
  }
};
