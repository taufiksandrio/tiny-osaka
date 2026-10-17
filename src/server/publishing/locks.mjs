import "server-only";
import { sql } from "drizzle-orm";
export const publishingLock = tx => tx.execute(sql`SELECT pg_advisory_xact_lock(76210990)`);
export const cancelPending = async (tx, target, actorId, { exceptId = null, revisionId = null, code = "MANUAL_PUBLICATION" } = {}) => {
  const rows = (await tx.execute(sql`UPDATE public.publication_jobs SET status='cancelled',version=version+1,last_code=${code},updated_at=clock_timestamp()
    WHERE target=${target} AND status='scheduled' AND (${exceptId}::uuid IS NULL OR id<>${exceptId}::uuid)
    AND (${revisionId}::uuid IS NULL OR coalesce(page_revision_id,catalog_revision_id)=${revisionId}::uuid) RETURNING id,version`)).rows;
  for (const row of rows) await tx.execute(sql`INSERT INTO public.publication_events(job_id,job_version,action,actor_id,source)
    VALUES(${row.id}::uuid,${row.version},'cancel',${actorId},'cms')`);
};
