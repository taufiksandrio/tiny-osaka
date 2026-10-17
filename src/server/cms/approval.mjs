import "server-only";
import { eq, sql } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { publishingLock } from "../publishing/locks.mjs";
import { createPublishing } from "../publishing/service.mjs";
import { PublishingError } from "../publishing/policy.mjs";
import { validPageUuid, validPageVersion } from "../pages/validation.mjs";
import { cmsFail } from "./request-policy.mjs";

// The caller owns the transaction: submission, approval and publication either
// all commit together, or leave both the draft and previous live copy intact.
const approve = async ({ tx, actor, domain, input, workflow }) => {
  if (actor.role !== "owner") cmsFail("FORBIDDEN", 403);
  if (!validPageUuid(input.revisionId) || !validPageVersion(input.expectedVersion)) cmsFail("INVALID_INPUT");
  await publishingLock(tx);
  const table = domain === "page" ? s.pageRevisions : s.catalogRevisions;
  const [identity] = await tx.select().from(table).where(eq(table.id, input.revisionId));
  if (!identity) cmsFail("REVISION_CONFLICT", 409);
  const target = domain === "page" ? `page:${identity.pageKey}` : "catalog";
  // Keep the same lock order as the worker and manual publication.
  if (domain === "page") await tx.execute(sql`SELECT pg_advisory_xact_lock(76210985,hashtext(${identity.pageKey}))`);
  else await tx.execute(sql`SELECT pg_advisory_xact_lock(76210984)`);
  const [row] = await tx.select().from(table).where(eq(table.id, input.revisionId)).for("update");
  if (row.version !== input.expectedVersion || !["draft", "review", "approved"].includes(row.status)) cmsFail("REVISION_CONFLICT", 409);
  if (row.contentHash !== input.expectedHash) cmsFail("HASH_CONFLICT", 409);
  let token = { revisionId: row.id, expectedVersion: row.version, expectedHash: row.contentHash };
  if (row.status === "draft") {
    const submitted = await workflow.submit({ revisionId: row.id, expectedVersion: row.version });
    token = { ...token, expectedHash: submitted.contentHash };
  }
  if (row.status !== "approved") await workflow.approve(token);
  try {
    const pending = (await tx.execute(sql`SELECT id,coalesce(page_revision_id,catalog_revision_id) AS revision_id
      FROM public.publication_jobs WHERE target=${target} AND status='scheduled'`)).rows[0];
    if (input.dueAt !== undefined) {
      await createPublishing({ db: tx, authenticate: async () => actor }).write(null,
        { action: "schedule", domain, ...token, dueAt: input.dueAt });
    } else if (pending) {
      // Never silently cancel a schedule while approving a different revision.
      if (pending.revision_id !== row.id) cmsFail("SCHEDULE_EXISTS", 409);
    } else return await workflow.publish(token);
  } catch (error) {
    if (error instanceof PublishingError) cmsFail(error.code, error.code === "SCHEDULE_EXISTS" ? 409 : 400);
    throw error;
  }
  return { revisionId: row.id, status: "approved", scheduled: true };
};

export const approveContent = async options => {
  try { return await approve(options); }
  catch (error) {
    if (["40001", "40P01"].includes(error.code ?? error.cause?.code)) cmsFail("REVISION_CONFLICT", 409);
    throw error;
  }
};
