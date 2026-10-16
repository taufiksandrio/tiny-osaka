import "server-only";
import { and, eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { getPageDefinition, isPageLocale } from "./templates.mjs";
import { loadPageGraph, pagePersistence } from "./drafts.mjs";
import { hashPageContent } from "./content-hash.mjs";
import { pageFail, validatePageReadiness } from "./validation.mjs";
import { publicRevisionMedia } from "../media/validation.mjs";

// No revision argument/fallback: caller receives exactly one published locale.
export const getPublishedPage = async (db, input) => {
  if (!getPageDefinition(input?.pageKey) || !isPageLocale(input?.locale)) pageFail("INVALID_INPUT", "Unknown page or locale.");
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.select({ revision: s.pageRevisions }).from(s.pagePublications)
        .innerJoin(s.pageRevisions, and(eq(s.pageRevisions.id, s.pagePublications.revisionId),
          eq(s.pageRevisions.pageKey, s.pagePublications.pageKey), eq(s.pageRevisions.contentHash, s.pagePublications.contentHash)))
        .innerJoin(s.pageApprovals, and(eq(s.pageApprovals.revisionId, s.pagePublications.revisionId),
          eq(s.pageApprovals.contentHash, s.pagePublications.contentHash)))
        .where(and(eq(s.pagePublications.pageKey, input.pageKey), eq(s.pageRevisions.status, "published")));
      if (!row) return null;
      const graph = await loadPageGraph(tx, row.revision);
      validatePageReadiness(graph);
      if (hashPageContent(graph) !== row.revision.contentHash) pageFail("HASH_CONFLICT", "Published page integrity differs.");
      const translation = graph.translations.find(row => row.locale === input.locale);
      return { pageKey: graph.page.key, template: graph.page.template, revisionId: row.revision.id,
        version: row.revision.version, locale: translation.locale, fields: translation.fields,
        media: publicRevisionMedia(graph, "page", input.locale) };
    });
  } catch (error) { pagePersistence(error); }
};

