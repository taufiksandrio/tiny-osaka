import "server-only";
import { sql } from "drizzle-orm";
import { createPageWorkflow } from "../pages/workflow.mjs";
import { createCatalogWorkflow } from "../catalog/workflow.mjs";
import { publishingLock } from "./locks.mjs";
import { member, snapshot, event } from "./service.mjs";

// A job persists a real Owner's earlier authorization. Never invent an actor.
export const runNextPublication = db => db.transaction(async tx => {
  await publishingLock(tx);
  const [job] = (await tx.execute(sql`SELECT * FROM public.publication_jobs WHERE status='scheduled' AND next_attempt_at<=clock_timestamp()
    ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE`)).rows;
  if (!job) return null;
  const domain = job.page_revision_id ? "page" : "catalog";
  const revisionId = job.page_revision_id ?? job.catalog_revision_id;
  const owner = await member(tx, job.created_by);
  const root = await snapshot(tx, domain, revisionId);
  let code = owner?.role !== "owner" ? "OWNER_UNAVAILABLE" :
    !root || root.status !== "approved" || root.version !== job.revision_version || root.content_hash !== job.content_hash ? "REVISION_UNAVAILABLE" :
      (root.live ?? null) !== job.expected_live_revision_id ? "PUBLICATION_CHANGED" : null;
  let retry = false;
  if (!code) {
    try {
      await tx.transaction(async savepoint => {
        const factory = domain === "page" ? createPageWorkflow : createCatalogWorkflow;
        await factory({ db: savepoint, scheduledJobId: job.id,
          resolveActor: async () => ({ subject: job.created_by, role: owner.role }) }).publish({
          revisionId, expectedVersion: job.revision_version, expectedHash: job.content_hash,
        });
      });
    } catch (error) {
      retry = error.code === "PERSISTENCE_FAILED" && job.attempts < 2;
      code = retry ? "RETRY" : "PUBLISH_FAILED";
    }
  }
  const status = retry ? "scheduled" : code ? "failed" : "succeeded";
  const [updated] = (await tx.execute(sql`UPDATE public.publication_jobs SET status=${status},attempts=attempts+1,version=version+1,
    last_code=${code},next_attempt_at=clock_timestamp()+${30 * (job.attempts + 1)}*interval '1 second',updated_at=clock_timestamp()
    WHERE id=${job.id}::uuid RETURNING id,version,status,last_code,attempts,next_attempt_at`)).rows;
  await event(tx, updated, retry ? "retry" : status, job.created_by, "worker");
  return updated;
});
