import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { isDeepStrictEqual } from "node:util";
import { getPageDefinition, pageTemplateFields } from "../pages/templates.mjs";
import { createPageDraft, clonePageDraft, loadPageGraph } from "../pages/drafts.mjs";
import { hashPageContent } from "../pages/content-hash.mjs";
import { validPageUuid, validatePageReadiness } from "../pages/validation.mjs";
import { publishingLock } from "../publishing/locks.mjs";
import { cmsFail, exactInput } from "./request-policy.mjs";

export const currentPageRoot = async (tx, pageKey) => {
  if (!getPageDefinition(pageKey)) cmsFail("NOT_FOUND", 404);
  const [live] = await tx.select().from(s.pagePublications).where(eq(s.pagePublications.pageKey, pageKey));
  const [root] = live ? await tx.select().from(s.pageRevisions).where(eq(s.pageRevisions.id, live.revisionId)) :
    await tx.select().from(s.pageRevisions).where(eq(s.pageRevisions.pageKey, pageKey))
      .orderBy(desc(s.pageRevisions.createdAt), desc(s.pageRevisions.id)).limit(1);
  const [lastEdit] = root && !live ? await tx.select({ createdAt: s.pageWorkflowEvents.createdAt }).from(s.pageWorkflowEvents)
    .where(eq(s.pageWorkflowEvents.revisionId, root.id)).orderBy(desc(s.pageWorkflowEvents.createdAt)).limit(1) : [];
  return { root, updatedAt: live?.publishedAt ?? lastEdit?.createdAt ?? root?.createdAt ?? null };
};

export const readCurrentPage = async (tx, pageKey, api) => {
  const { root, updatedAt } = await currentPageRoot(tx, pageKey);
  return root ? { ...await api.read(null, root.id), updatedAt } :
    { pageKey, id: null, version: 0, fields: {}, mediaRefs: [], mediaAssets: [], updatedAt: null };
};

// Only called after current enabled membership is checked in the CMS transaction.
// These immutable records preserve the existing public-reader integrity contract;
// they are not user-facing drafts, approvals or an impersonated Owner identity.
const plain = value => value && typeof value === "object" && !Array.isArray(value);

// MCP page_update: partial merge under the same locks as saveCurrentPage. expectedRevisionId/expectedVersion come from the
// page read under the lock; a caller-supplied value (page_save alias) that differs is a REVISION_CONFLICT.
// A save that changes nothing returns the current page without creating a revision.
export const mergeCurrentPage = async (tx, actor, input, api) => {
  const { pageKey, fields = {}, mediaOperations = [], expectedRevisionId, expectedVersion } = input ?? {};
  if (!["owner", "staff"].includes(actor.role)) cmsFail("FORBIDDEN", 403);
  const definition = getPageDefinition(pageKey);
  if (!definition) cmsFail("NOT_FOUND", 404);
  if (!plain(fields) || !Array.isArray(mediaOperations) || mediaOperations.length > 24 ||
    mediaOperations.some(row => !plain(row) || !["mediaSave", "mediaRemove"].includes(row.action) || (row.data !== undefined && !plain(row.data)))) cmsFail("INVALID_INPUT");
  const allowed = Object.keys(pageTemplateFields[definition.template]);
  const unknown = Object.keys(fields).find(key => !allowed.includes(key));
  if (unknown) cmsFail("INVALID_CONTENT", 400, { field: unknown });
  await publishingLock(tx);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(76210985,hashtext(${pageKey}))`);
  const current = await readCurrentPage(tx, pageKey, api);
  if ((expectedRevisionId !== undefined && expectedRevisionId !== current.id) ||
    (expectedVersion !== undefined && expectedVersion !== current.version)) cmsFail("REVISION_CONFLICT", 409);
  const merged = { ...current.fields, ...fields };
  if (current.id && !mediaOperations.length && isDeepStrictEqual(merged, current.fields)) return current;
  const title = typeof merged.title === "string" ? merged.title.trim() : "";
  const operations = mediaOperations.map(row => {
    if (row.action === "mediaRemove") return { action: "mediaRemove", data: row.data ?? {} };
    const data = { referenceId: null, captionId: "", sortOrder: 0, ...row.data };
    if (data.altId === undefined || (typeof data.altId === "string" && !data.altId.trim())) {
      if (!title) cmsFail("INVALID_INPUT", 400, { field: "altId" });
      data.altId = title;
    }
    return { action: "mediaSave", data };
  });
  return saveCurrentPage(tx, actor, { pageKey, expectedRevisionId: current.id, expectedVersion: current.version, fields: merged, mediaOperations: operations }, api);
};

export const saveCurrentPage = async (tx, actor, input, api) => {
  exactInput(input, ["pageKey", "expectedRevisionId", "expectedVersion", "fields", "mediaOperations"]);
  if (!["owner", "staff"].includes(actor.role)) cmsFail("FORBIDDEN", 403);
  if (!getPageDefinition(input.pageKey) ||
    !(input.expectedRevisionId === null || validPageUuid(input.expectedRevisionId)) ||
    !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 ||
    !Array.isArray(input.mediaOperations) || input.mediaOperations.length > 24 ||
    input.mediaOperations.some(row => !row || !["mediaSave", "mediaRemove"].includes(row.action))) cmsFail("INVALID_INPUT");
  await publishingLock(tx);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(76210985,hashtext(${input.pageKey}))`);
  const { root } = await currentPageRoot(tx, input.pageKey);
  if ((root?.id ?? null) !== input.expectedRevisionId || (root?.version ?? 0) !== input.expectedVersion) cmsFail("REVISION_CONFLICT", 409);
  const next = root ? await clonePageDraft(tx, { sourceRevisionId: root.id, expectedSourceVersion: root.version }) :
    await createPageDraft(tx, { pageKey: input.pageKey });
  await tx.insert(s.pageWorkflowEvents).values({ revisionId: next.id, action: root ? "clone" : "create", actorId: actor.subject });
  await api.batch(null, { revisionId: next.id, expectedVersion: next.version,
    operations: [{ action: "save", data: { fields: input.fields } }, ...input.mediaOperations] });
  const [saved] = await tx.select().from(s.pageRevisions).where(eq(s.pageRevisions.id, next.id));
  const graph = await loadPageGraph(tx, saved);
  validatePageReadiness(graph);
  const contentHash = hashPageContent(graph);
  await tx.insert(s.pageSubmissions).values({ revisionId: saved.id, version: saved.version, contentHash, submittedBy: actor.subject });
  await tx.update(s.pageRevisions).set({ status: "review", contentHash }).where(eq(s.pageRevisions.id, saved.id));
  await tx.insert(s.pageApprovals).values({ revisionId: saved.id, contentHash, approvedBy: actor.subject });
  await tx.update(s.pageRevisions).set({ status: "approved" }).where(eq(s.pageRevisions.id, saved.id));
  await tx.update(s.pageRevisions).set({ status: "published" }).where(eq(s.pageRevisions.id, saved.id));
  await tx.insert(s.pagePublications).values({ pageKey: input.pageKey, revisionId: saved.id, contentHash })
    .onConflictDoUpdate({ target: s.pagePublications.pageKey, set: { revisionId: saved.id, contentHash, publishedAt: sql`now()` } });
  await tx.insert(s.pageWorkflowEvents).values(["submit", "approve", "publish"].map(action => ({ revisionId: saved.id, action, actorId: actor.subject })));
  return readCurrentPage(tx, input.pageKey, api);
};
