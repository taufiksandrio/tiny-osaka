import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { roles } from "../db/auth-schema.mjs";
import { exactInput, cmsFail } from "../cms/request-policy.mjs";
import { publishingLock } from "./locks.mjs";
import { parseSchedule, validId, publishingFail } from "./policy.mjs";

export const member = async (tx, subject) => {
  const [row] = await tx.select().from(roles).where(and(eq(roles.userId, subject), eq(roles.enabled, true)));
  return row;
};
export const snapshot = async (tx, domain, id) => {
  if (domain === "page") return (await tx.execute(sql`SELECT r.id,r.version,r.content_hash,r.status,'page:'||r.page_key AS target,p.revision_id AS live
    FROM public.page_revisions r LEFT JOIN public.page_publications p ON p.page_key=r.page_key WHERE r.id=${id}::uuid`)).rows[0];
  return (await tx.execute(sql`SELECT r.id,r.version,r.content_hash,r.status,'catalog' AS target,p.revision_id AS live
    FROM public.catalog_revisions r LEFT JOIN public.catalog_publication p ON p.id=1 WHERE r.id=${id}::uuid`)).rows[0];
};
export const event = (tx, job, action, actor, source) => tx.execute(sql`INSERT INTO public.publication_events(job_id,job_version,action,actor_id,source)
  VALUES(${job.id}::uuid,${job.version},${action},${actor},${source})`);
const jobDto = row => ({ ...row, ...Object.fromEntries(["due_at", "next_attempt_at", "created_at"]
  .map(key => [key, new Date(row[key]).toISOString()])) });
export const createPublishing = ({ db, authenticate }) => {
  const run = async (headers, owner, callback) => {
    const actor = await authenticate(headers);
    if (!actor) cmsFail("AUTH_REQUIRED", 401);
    return db.transaction(async tx => {
      await publishingLock(tx);
      const membership = await member(tx, actor.subject);
      if (!membership || !["owner", "staff"].includes(membership.role)) cmsFail("AUTH_REQUIRED", 401);
      if (owner && membership.role !== "owner") cmsFail("FORBIDDEN", 403);
      return callback(tx, actor.subject);
    });
  };
  return {
    list: headers => run(headers, false, async tx => (await tx.execute(sql`SELECT id,page_revision_id,catalog_revision_id,target,revision_version,
      due_at,next_attempt_at,status,attempts,version,last_code,created_at FROM public.publication_jobs ORDER BY (status='scheduled') DESC,created_at DESC,id DESC LIMIT 100`)).rows.map(jobDto)),
    write: (headers, input) => run(headers, true, async (tx, actor) => {
      if (input?.action === "schedule") {
        exactInput(input, ["action", "domain", "revisionId", "expectedVersion", "expectedHash", "dueAt"]);
        if (!["page", "catalog"].includes(input.domain) || !validId(input.revisionId) || !Number.isInteger(input.expectedVersion) ||
          !/^[0-9a-f]{64}$/.test(input.expectedHash ?? "")) publishingFail("INVALID_INPUT");
        const due = parseSchedule(input.dueAt);
        if (due <= new Date() || due > new Date(Date.now() + 365 * 86400000)) publishingFail("INVALID_TIME");
        const root = await snapshot(tx, input.domain, input.revisionId);
        if (!root || root.status !== "approved" || root.version !== input.expectedVersion || root.content_hash !== input.expectedHash) publishingFail("REVISION_UNAVAILABLE");
        if ((await tx.execute(sql`SELECT id FROM public.publication_jobs WHERE target=${root.target} AND status='scheduled'`)).rows.length) publishingFail("SCHEDULE_EXISTS");
        const [job] = (await tx.execute(sql`INSERT INTO public.publication_jobs(page_revision_id,catalog_revision_id,target,revision_version,content_hash,
          expected_live_revision_id,due_at,next_attempt_at,created_by) VALUES(
          ${input.domain === "page" ? root.id : null}::uuid,${input.domain === "catalog" ? root.id : null}::uuid,${root.target},${root.version},${root.content_hash},
          ${root.live ?? null}::uuid,${due.toISOString()}::timestamptz,${due.toISOString()}::timestamptz,${actor}) RETURNING id,version`)).rows;
        await event(tx, job, "schedule", actor, "cms");
        return job;
      }
      exactInput(input, ["action", "jobId", "expectedVersion"]);
      if (input.action !== "cancel" || !validId(input.jobId) || !Number.isInteger(input.expectedVersion)) publishingFail("INVALID_INPUT");
      const [job] = (await tx.execute(sql`UPDATE public.publication_jobs SET status='cancelled',version=version+1,last_code='CANCELLED',updated_at=clock_timestamp()
        WHERE id=${input.jobId}::uuid AND version=${input.expectedVersion} AND status='scheduled' RETURNING id,version`)).rows;
      if (!job) publishingFail("SCHEDULE_CONFLICT");
      await event(tx, job, "cancel", actor, "cms");
      return job;
    }),
  };
};
