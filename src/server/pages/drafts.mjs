import "server-only";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { getPageDefinition } from "./templates.mjs";
import { PageContentError, pageFail, validPageUuid, validPageVersion, validatePageFields } from "./validation.mjs";
import { loadRevisionMedia } from "../media/references.mjs";

export const pagePersistence = error => {
  if (error instanceof PageContentError) throw error;
  if (["40001", "40P01"].includes(error.code ?? error.cause?.code)) pageFail("REVISION_CONFLICT", "Revision changed concurrently; reload before retry.");
  pageFail("PERSISTENCE_FAILED", "Page operation failed; no driver details exposed.");
};
export const loadPageGraph = async (tx, revision) => {
  const [page] = await tx.select().from(s.pages).where(eq(s.pages.key, revision.pageKey));
  const translations = await tx.select().from(s.pageTranslations).where(eq(s.pageTranslations.revisionId, revision.id));
  return { page, revision, translations, ...await loadRevisionMedia(tx, revision.id, "page") };
};

// Internal server persistence primitives, called through the authorized workflow.
// No endpoint receives db or a caller-provided identity/role.
export const createPageDraft = async (db, input) => {
  const definition = getPageDefinition(input?.pageKey);
  if (!definition) pageFail("INVALID_INPUT", "Unknown fixed page key.");
  try {
    return await db.transaction(async tx => {
      await tx.insert(s.pages).values({ key: definition.key, template: definition.template }).onConflictDoNothing();
      const [page] = await tx.select().from(s.pages).where(eq(s.pages.key, definition.key));
      if (page?.template !== definition.template) pageFail("REVISION_CONFLICT", "Page template differs.");
      const [revision] = await tx.insert(s.pageRevisions).values({ pageKey: page.key }).returning();
      return revision;
    });
  } catch (error) { pagePersistence(error); }
};

export const savePageTranslation = async (db, input) => {
  if (!input || !validPageUuid(input.revisionId) || !validPageVersion(input.expectedVersion) || input.expectedVersion === 2147483647) {
    pageFail("INVALID_INPUT", "Require a writable revision and version.");
  }
  try {
    return await db.transaction(async tx => {
      const [revision] = await tx.select().from(s.pageRevisions).where(and(eq(s.pageRevisions.id, input.revisionId),
        eq(s.pageRevisions.version, input.expectedVersion), eq(s.pageRevisions.status, "draft"))).for("update");
      if (!revision) pageFail("REVISION_CONFLICT", "Draft changed or is frozen.");
      validatePageFields(revision.pageKey, input.locale, input.fields);
      // Detach caller-owned input before asynchronous persistence.
      const fields = JSON.parse(JSON.stringify(input.fields));
      const [row] = await tx.insert(s.pageTranslations).values({ revisionId: revision.id, locale: input.locale, fields })
        .onConflictDoUpdate({ target: [s.pageTranslations.revisionId, s.pageTranslations.locale], set: { fields } }).returning();
      await tx.update(s.pageRevisions).set({ version: sql`version + 1` }).where(eq(s.pageRevisions.id, revision.id));
      return { ...row, version: revision.version + 1 };
    });
  } catch (error) { pagePersistence(error); }
};

export const clonePageDraft = async (db, input) => {
  if (!input || !validPageUuid(input.sourceRevisionId) || !validPageVersion(input.expectedSourceVersion)) {
    pageFail("INVALID_INPUT", "Require an exact source revision and version.");
  }
  try {
    return await db.transaction(async tx => {
      const [source] = await tx.select().from(s.pageRevisions).where(and(eq(s.pageRevisions.id, input.sourceRevisionId),
        eq(s.pageRevisions.version, input.expectedSourceVersion))).for("share");
      if (!source) pageFail("REVISION_CONFLICT", "Source revision changed or is unavailable.");
      const [draft] = await tx.insert(s.pageRevisions).values({ pageKey: source.pageKey }).returning();
      await tx.execute(sql`INSERT INTO public.page_translations(revision_id,locale,fields)
        SELECT ${draft.id}::uuid,locale,fields FROM public.page_translations WHERE revision_id=${source.id}::uuid`);
      await tx.execute(sql`INSERT INTO public.page_media_refs(revision_id,id,asset_id,alt_id,alt_en,caption_id,caption_en,sort_order)
        SELECT ${draft.id}::uuid,id,asset_id,alt_id,alt_en,caption_id,caption_en,sort_order
        FROM public.page_media_refs WHERE revision_id=${source.id}::uuid`);
      return draft;
    });
  } catch (error) { pagePersistence(error); }
};

