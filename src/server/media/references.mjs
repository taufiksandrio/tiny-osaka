import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { mediaPolicy } from "./policy.mjs";
import { mediaPersistence, resolveMediaActor } from "./assets.mjs";
import { mediaFail, validMediaUuid, validMediaVersion, validateMediaRefText } from "./validation.mjs";

export const loadRevisionMedia = async (tx, revisionId, domain) => {
  const table = domain === "catalog" ? s.catalogMediaRefs : s.pageMediaRefs;
  const mediaRefs = await tx.select().from(table).where(eq(table.revisionId, revisionId));
  if (!mediaRefs.length) return { mediaRefs, mediaAssets: [] };
  const direct = await tx.select().from(s.mediaAssets).where(inArray(s.mediaAssets.id, [...new Set(mediaRefs.map(row => row.assetId))]));
  const posterIds = [...new Set(direct.map(row => row.posterId).filter(Boolean))].filter(id => !direct.some(row => row.id === id));
  const posters = posterIds.length ? await tx.select().from(s.mediaAssets).where(inArray(s.mediaAssets.id, posterIds)) : [];
  return { mediaRefs, mediaAssets: [...direct, ...posters] };
};

export const createMediaReferences = ({ db, resolveActor } = {}) => {
  const edit = (domain, remove) => async input => {
    await resolveMediaActor(resolveActor);
    if (!input || !validMediaUuid(input.revisionId) || !validMediaVersion(input.expectedVersion) ||
      (domain === "catalog" && !validMediaUuid(input.productId)) ||
      (remove && !validMediaUuid(input.referenceId)) ||
      (!remove && (!validMediaUuid(input.assetId) || (input.referenceId != null && !validMediaUuid(input.referenceId))))) {
      mediaFail("INVALID_INPUT", "Require exact writable revision, parent and media IDs.");
    }
    if (!remove) validateMediaRefText(input);
    const root = domain === "catalog" ? s.catalogRevisions : s.pageRevisions;
    const table = domain === "catalog" ? s.catalogMediaRefs : s.pageMediaRefs;
    try {
      return await db.transaction(async tx => {
        const [revision] = await tx.select().from(root).where(and(eq(root.id, input.revisionId),
          eq(root.version, input.expectedVersion), eq(root.status, "draft"))).for("update");
        if (!revision) mediaFail("REVISION_CONFLICT", "Draft changed or is frozen.");
        if (domain === "catalog") {
          const [parent] = await tx.select().from(s.productEntries).where(and(eq(s.productEntries.revisionId, revision.id),
            eq(s.productEntries.productId, input.productId)));
          if (!parent) mediaFail("ENTRY_NOT_FOUND", "Product does not belong to this draft.");
        }
        const scope = [eq(table.revisionId, revision.id)];
        if (domain === "catalog") scope.push(eq(table.productId, input.productId));
        let row;
        if (remove) {
          [row] = await tx.delete(table).where(and(...scope, eq(table.id, input.referenceId))).returning();
          if (!row) mediaFail("REFERENCE_NOT_FOUND", "Reference does not belong to this draft scope.");
        } else {
          const [asset] = await tx.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, input.assetId));
          if (!asset) mediaFail("ASSET_NOT_FOUND", "Registered media asset required.");
          const values = { assetId: asset.id, altId: input.altId, altEn: input.altEn,
            captionId: input.captionId, captionEn: input.captionEn, sortOrder: input.sortOrder };
          if (input.referenceId) {
            [row] = await tx.update(table).set(values).where(and(...scope, eq(table.id, input.referenceId))).returning();
            if (!row) mediaFail("REFERENCE_NOT_FOUND", "Reference does not belong to this draft scope.");
          } else {
            const existing = await tx.select({ id: table.id }).from(table).where(and(...scope));
            if (existing.length >= mediaPolicy.references) mediaFail("MEDIA_LIMIT", "Maximum twelve media references per product/page.");
            [row] = await tx.insert(table).values({ ...values, revisionId: revision.id,
              ...(domain === "catalog" ? { productId: input.productId } : {}) }).returning();
          }
        }
        await tx.update(root).set({ version: sql`version + 1` }).where(eq(root.id, revision.id));
        return { ...row, version: revision.version + 1 };
      });
    } catch (error) { mediaPersistence(error); }
  };
  return Object.freeze({ saveCatalog: edit("catalog", false), removeCatalog: edit("catalog", true),
    savePage: edit("page", false), removePage: edit("page", true) });
};

