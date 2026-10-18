import { saveBatch } from "./batch.mjs";
import { currentPageRoot, readCurrentPage, saveCurrentPage } from "./current-pages.mjs";
import "server-only";
import { and, eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { roles } from "../db/auth-schema.mjs";
import { pageDefinitions } from "../pages/templates.mjs";
import { validPageUuid } from "../pages/validation.mjs";
import { cmsFail } from "./request-policy.mjs";
import { loadRevisionMedia, mediaRefDto } from "../media/references.mjs";
import { assetDto } from "./media.mjs";

export const createCmsPages = ({ db, authenticate }) => {
  const run = async (headers, callback) => {
    const actor = await authenticate(headers);
    if (!actor) cmsFail("AUTH_REQUIRED", 401);
    return db.transaction(async tx => {
      // Recheck enabled membership inside the content transaction, using server identity.
      const [member] = await tx.select().from(roles).where(and(eq(roles.userId, actor.subject), eq(roles.enabled, true)));
      if (!member || !["owner", "staff"].includes(member.role)) cmsFail("AUTH_REQUIRED", 401);
      const trusted = { subject: actor.subject, role: member.role };
      try { return await callback(tx, trusted); }
      catch (error) {
        if (["40001", "40P01"].includes(error.code ?? error.cause?.code)) cmsFail("REVISION_CONFLICT", 409);
        throw error;
      }
    }, { isolationLevel: "repeatable read" });
  };
  return Object.freeze({
    // Internal: the direct editor reloads the revision it just wrote. Not exposed over HTTP.
    read: (headers, id) => run(headers, async tx => {
      if (!validPageUuid(id)) cmsFail("INVALID_INPUT");
      const [row] = await tx.select().from(s.pageRevisions).where(eq(s.pageRevisions.id, id));
      if (!row) cmsFail("NOT_FOUND", 404);
      const translations = await tx.select().from(s.pageTranslations).where(eq(s.pageTranslations.revisionId, id));
      const [live] = await tx.select().from(s.pagePublications).where(eq(s.pagePublications.pageKey, row.pageKey));
      const media = await loadRevisionMedia(tx, id, "page");
      return { ...row, fields: translations[0]?.fields ?? {}, mediaRefs: media.mediaRefs.map(mediaRefDto), mediaAssets: media.mediaAssets.map(assetDto), isLive: live?.revisionId === id };
    }),
    current: (headers, pageKey) => run(headers, (tx, actor) => readCurrentPage(tx, pageKey, createCmsPages({ db: tx, authenticate: async () => actor }))),
    saveCurrent: (headers, input) => run(headers, (tx, actor) => saveCurrentPage(tx, actor, input, createCmsPages({ db: tx, authenticate: async () => actor }))),
    batch: (headers, input) => run(headers, (tx, actor) => saveBatch(tx, actor, input)),
    list: headers => run(headers, async tx => {
      const publications = await tx.select().from(s.pagePublications);
      const pages = [];
      for (const page of Object.values(pageDefinitions)) pages.push({ ...page,
        publishedRevisionId: publications.find(row => row.pageKey === page.key)?.revisionId ?? null,
        updatedAt: (await currentPageRoot(tx, page.key)).updatedAt });
      return pages;
    }),
  });
};