import "server-only";
import { and, eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { loadCatalogGraph } from "./review.mjs";
import { hashCatalogContent } from "./content-hash.mjs";
import { CatalogDraftError } from "./drafts.mjs";
import { publicRevisionMedia } from "../media/validation.mjs";

// No revision ID argument: callers cannot turn this into a draft reader.
export const getPublishedCatalog = async db => {
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.select({ revision: s.catalogRevisions }).from(s.catalogPublication)
        .innerJoin(s.catalogRevisions, and(eq(s.catalogRevisions.id, s.catalogPublication.revisionId),
          eq(s.catalogRevisions.contentHash, s.catalogPublication.contentHash)))
        .innerJoin(s.catalogApprovals, and(eq(s.catalogApprovals.revisionId, s.catalogPublication.revisionId),
          eq(s.catalogApprovals.contentHash, s.catalogPublication.contentHash)))
        .where(and(eq(s.catalogPublication.id, 1), eq(s.catalogRevisions.status, "published")));
      if (!row) return null;
      const graph = await loadCatalogGraph(tx, row.revision);
      if (hashCatalogContent(graph) !== row.revision.contentHash) throw new Error("Content integrity failure.");
      // Do not expose workflow audit identities or approval metadata.
      const content = { ...graph };
      delete content.mediaRefs;
      delete content.mediaAssets;
      // Order links are admin-only until a separate decision shows them publicly (migration 0015).
      content.productEntries = content.productEntries.map(entry => {
        const publicEntry = { ...entry };
        for (const field of ["grabfoodUrl", "gofoodUrl", "shopeefoodUrl"]) delete publicEntry[field];
        return publicEntry;
      });
      return { ...content, media: publicRevisionMedia(graph, "catalog"), revision: { id: row.revision.id, version: row.revision.version } };
    });
  } catch {
    throw new CatalogDraftError("PERSISTENCE_FAILED", "Published catalog read failed.");
  }
};

