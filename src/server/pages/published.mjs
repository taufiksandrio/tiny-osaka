import "server-only";
import { and, eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { getPageDefinition } from "./templates.mjs";
import { STORED_LOCALE } from "../db/stored-language.mjs";
import { loadPageGraph, pagePersistence } from "./drafts.mjs";
import { hashPageContent } from "./content-hash.mjs";
import { pageFail, validatePageReadiness } from "./validation.mjs";
import { publicRevisionMedia } from "../media/validation.mjs";

// No revision argument/fallback: caller receives the single published Indonesian version.
export const getPublishedPage = async (db, input) => {
  if (!getPageDefinition(input?.pageKey)) pageFail("INVALID_INPUT", "Unknown page.");
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
      const translation = graph.translations.find(row => row.locale === STORED_LOCALE);
      return { pageKey: graph.page.key, template: graph.page.template, revisionId: row.revision.id,
        version: row.revision.version, fields: translation.fields,
        media: publicRevisionMedia(graph, "page") };
    });
  } catch (error) { pagePersistence(error); }
};

