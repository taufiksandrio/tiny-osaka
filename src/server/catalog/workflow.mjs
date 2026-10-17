import { publishingLock } from "../publishing/locks.mjs";
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { CatalogDraftError } from "./drafts.mjs";
import { loadCatalogGraph } from "./review.mjs";
import { validateCatalogReviewReadiness } from "./review-readiness.mjs";
import { hashCatalogContent } from "./content-hash.mjs";

const fail = (code, message) => { throw new CatalogDraftError(code, message); };
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validateInput = (input, action) => {
  if (!input || !uuid(input.revisionId) || !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 1 || input.expectedVersion > 2147483647 ||
    (action !== "submit" && (typeof input.expectedHash !== "string" || !/^[0-9a-f]{64}$/.test(input.expectedHash)))) {
    fail("INVALID_INPUT", "Require a revision ID, version and exact submitted hash.");
  }
};

// Only trusted server composition may inject a resolver. No HTTP handler accepts
// actor/role input. Without a real identity provider every action fails closed.
export const createCatalogWorkflow = ({ db, resolveActor } = {}) => {
  const run = async (action, input) => {
    let actor;
    try { actor = typeof resolveActor === "function" ? await resolveActor() : null; }
    catch { fail("AUTH_REQUIRED", "Authenticated server identity required."); }
    if (!actor || typeof actor.subject !== "string" || actor.subject.trim().length === 0 ||
      actor.subject.length > 200 || actor.subject.includes("\0") || !["staff", "owner"].includes(actor.role)) {
      fail("AUTH_REQUIRED", "Authenticated server identity required.");
    }
    if (action !== "submit" && actor.role !== "owner") fail("FORBIDDEN", "Owner permission required.");
    validateInput(input, action);
    try {
      return await db.transaction(async tx => {
        if (["publish", "archive"].includes(action)) await publishingLock(tx);
        // Same lock order for publication and archive, including an absent pointer.
        if (action === "publish" || action === "archive") await tx.execute(sql`SELECT pg_advisory_xact_lock(76210984)`);
        const [revision] = await tx.select().from(s.catalogRevisions)
          .where(and(eq(s.catalogRevisions.id, input.revisionId), eq(s.catalogRevisions.version, input.expectedVersion))).for("update");
        if (!revision) fail("REVISION_CONFLICT", "Revision changed or is unavailable.");
        if (action !== "submit" && revision.contentHash !== input.expectedHash) fail("HASH_CONFLICT", "Submitted content hash differs.");
        const allowed = { submit: ["draft"], approve: ["review"], reject: ["review"],
          publish: ["approved", "published"], archive: ["approved", "rejected", "published"] };
        if (!allowed[action].includes(revision.status)) fail("REVISION_CONFLICT", "Action is unavailable for this revision.");
        const graph = await loadCatalogGraph(tx, revision);
        if (action === "submit" && !validateCatalogReviewReadiness(graph).ready) {
          fail("NOT_READY", "Complete bilingual catalog, pricing and media before submitting.");
        }
        const contentHash = hashCatalogContent(graph);
        if (action === "submit") {
          await tx.insert(s.catalogSubmissions).values({ revisionId: revision.id, version: revision.version,
            contentHash, submittedBy: actor.subject });
        } else {
          const [submission] = await tx.select().from(s.catalogSubmissions)
            .where(eq(s.catalogSubmissions.revisionId, revision.id));
          if (contentHash !== revision.contentHash || submission?.contentHash !== contentHash ||
            submission?.version !== revision.version) fail("HASH_CONFLICT", "Frozen content no longer matches its submission.");
        }
        if (action === "approve") await tx.insert(s.catalogApprovals).values({
          revisionId: revision.id, contentHash, approvedBy: actor.subject,
        });
        if (action === "publish" || action === "archive") {
          const [live] = await tx.select().from(s.catalogPublication).where(eq(s.catalogPublication.id, 1));
          if (action === "archive" && live?.revisionId === revision.id) fail("LIVE_REVISION", "Publish an approved replacement before archiving the live revision.");
          if (action === "publish") {
            const [approval] = await tx.select().from(s.catalogApprovals).where(eq(s.catalogApprovals.revisionId, revision.id));
            if (approval?.contentHash !== contentHash) fail("APPROVAL_REQUIRED", "Exact revision approval required.");
            if (live?.revisionId === revision.id) {
              return { revisionId: revision.id, version: revision.version, contentHash, status: "published" };
            }
            // A historical publication must be cloned and reviewed again.
            if (revision.status !== "approved") fail("REVISION_CONFLICT", "Clone the historical revision before republishing.");
          }
        }
        const status = { submit: "review", approve: "approved", reject: "rejected", publish: "published", archive: "archived" }[action];
        await tx.update(s.catalogRevisions).set({ status, contentHash }).where(eq(s.catalogRevisions.id, revision.id));
        if (action === "publish") await tx.insert(s.catalogPublication).values({ id: 1, revisionId: revision.id, contentHash })
          .onConflictDoUpdate({ target: s.catalogPublication.id, set: { revisionId: revision.id, contentHash, publishedAt: sql`now()` } });
        await tx.insert(s.catalogWorkflowEvents).values({ revisionId: revision.id, action, actorId: actor.subject });
        return { revisionId: revision.id, version: revision.version, contentHash, status };
      });
    } catch (error) {
      if (error instanceof CatalogDraftError) throw error;
      fail("PERSISTENCE_FAILED", "Catalog workflow failed; transaction rolled back.");
    }
  };
  return Object.freeze(Object.fromEntries(["submit", "approve", "reject", "publish", "archive"]
    .map(action => [action, input => run(action, input)])));
};

