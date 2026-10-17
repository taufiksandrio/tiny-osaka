import { publishingLock, cancelPending } from "../publishing/locks.mjs";
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { clonePageDraft, createPageDraft, loadPageGraph, pagePersistence, savePageTranslation } from "./drafts.mjs";
import { hashPageContent } from "./content-hash.mjs";
import { pageFail, validPageUuid, validPageVersion, validatePageReadiness } from "./validation.mjs";

// Inject only from trusted server composition. Request actor/role fields are ignored.
// Auth/session wiring is Phase 3; absent provider denies every write.
export const createPageWorkflow = ({ db, resolveActor, scheduledJobId = null } = {}) => {
  const authorize = async action => {
    let actor;
    try { actor = typeof resolveActor === "function" ? await resolveActor() : null; }
    catch { pageFail("AUTH_REQUIRED", "Authenticated server identity required."); }
    if (!actor || typeof actor.subject !== "string" || !actor.subject.trim() ||
      actor.subject.length > 200 || actor.subject.includes("\0") || !["staff", "owner"].includes(actor.role)) {
      pageFail("AUTH_REQUIRED", "Authenticated server identity required.");
    }
    if (["approve", "reject", "publish", "archive"].includes(action) && actor.role !== "owner") {
      pageFail("FORBIDDEN", "Owner permission required.");
    }
    return actor;
  };
  const draftAction = (action, save) => async input => {
    await authorize(action);
    return save(db, input);
  };
  const transition = action => async input => {
    const actor = await authorize(action);
    if (!input || !validPageUuid(input.revisionId) || !validPageVersion(input.expectedVersion) ||
      (action !== "submit" && (typeof input.expectedHash !== "string" || !/^[0-9a-f]{64}$/.test(input.expectedHash)))) {
      pageFail("INVALID_INPUT", "Require exact revision, version and submitted hash.");
    }
    try {
      return await db.transaction(async tx => {
        if (["publish", "archive"].includes(action)) await publishingLock(tx);
        if (["publish", "archive"].includes(action)) {
          // Identity is immutable: read page key before taking locks, then lock
          // the page before its revision. Same order on publish and archive.
          const [identity] = await tx.select({ pageKey: s.pageRevisions.pageKey }).from(s.pageRevisions)
            .where(eq(s.pageRevisions.id, input.revisionId));
          if (!identity) pageFail("REVISION_CONFLICT", "Revision is unavailable.");
          await tx.execute(sql`SELECT pg_advisory_xact_lock(76210985,hashtext(${identity.pageKey}))`);
        }
        const [revision] = await tx.select().from(s.pageRevisions).where(and(eq(s.pageRevisions.id, input.revisionId),
          eq(s.pageRevisions.version, input.expectedVersion))).for("update");
        if (!revision) pageFail("REVISION_CONFLICT", "Revision changed or is unavailable.");
        const allowed = { submit: ["draft"], approve: ["review"], reject: ["review"],
          publish: ["approved", "published"], archive: ["approved", "rejected", "published"] };
        if (!allowed[action].includes(revision.status)) pageFail("REVISION_CONFLICT", "Action unavailable for this revision.");
        if (action !== "submit" && revision.contentHash !== input.expectedHash) pageFail("HASH_CONFLICT", "Submitted hash differs.");
        const graph = await loadPageGraph(tx, revision);
        validatePageReadiness(graph);
        const contentHash = hashPageContent(graph);
        if (action === "submit") {
          await tx.insert(s.pageSubmissions).values({ revisionId: revision.id, version: revision.version,
            contentHash, submittedBy: actor.subject });
        } else {
          const [receipt] = await tx.select().from(s.pageSubmissions).where(eq(s.pageSubmissions.revisionId, revision.id));
          if (contentHash !== revision.contentHash || receipt?.contentHash !== contentHash || receipt?.version !== revision.version) {
            pageFail("HASH_CONFLICT", "Content differs from its exact submission.");
          }
        }
        if (action === "approve") await tx.insert(s.pageApprovals).values({
          revisionId: revision.id, contentHash, approvedBy: actor.subject,
        });
        if (["publish", "archive"].includes(action)) {
          const [live] = await tx.select().from(s.pagePublications).where(eq(s.pagePublications.pageKey, revision.pageKey));
          if (action === "archive" && live?.revisionId === revision.id) pageFail("LIVE_REVISION", "Publish an approved replacement before archiving this page.");
          if (action === "publish") {
            const [approval] = await tx.select().from(s.pageApprovals).where(eq(s.pageApprovals.revisionId, revision.id));
            if (approval?.contentHash !== contentHash) pageFail("APPROVAL_REQUIRED", "Exact page approval required.");
            if (live?.revisionId === revision.id) {
              await cancelPending(tx, `page:${revision.pageKey}`, actor.subject, { exceptId: scheduledJobId });
              return { revisionId: revision.id, pageKey: revision.pageKey, version: revision.version, contentHash, status: "published" };
            }
            if (revision.status !== "approved") pageFail("REVISION_CONFLICT", "Clone historical content before republishing.");
          }
        }
        const status = { submit: "review", approve: "approved", reject: "rejected", publish: "published", archive: "archived" }[action];
        await tx.update(s.pageRevisions).set({ status, contentHash }).where(eq(s.pageRevisions.id, revision.id));
        if (action === "publish") await tx.insert(s.pagePublications).values({ pageKey: revision.pageKey, revisionId: revision.id, contentHash })
          .onConflictDoUpdate({ target: s.pagePublications.pageKey, set: { revisionId: revision.id, contentHash, publishedAt: sql`now()` } });
        if (["publish", "archive"].includes(action)) await cancelPending(tx, `page:${revision.pageKey}`, actor.subject,
          action === "publish" ? { exceptId: scheduledJobId } : { revisionId: revision.id, code: "REVISION_UNAVAILABLE" });
        await tx.insert(s.pageWorkflowEvents).values({ revisionId: revision.id, action, actorId: actor.subject });
        return { revisionId: revision.id, pageKey: revision.pageKey, version: revision.version, contentHash, status };
      });
    } catch (error) { pagePersistence(error); }
  };
  return Object.freeze({
    createDraft: draftAction("create", createPageDraft),
    saveTranslation: draftAction("save", savePageTranslation),
    cloneDraft: draftAction("clone", clonePageDraft),
    ...Object.fromEntries(["submit", "approve", "reject", "publish", "archive"].map(action => [action, transition(action)])),
  });
};

