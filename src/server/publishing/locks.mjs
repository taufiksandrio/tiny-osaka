import "server-only";
import { sql } from "drizzle-orm";
// Serializes every catalog/page publication. Scheduled publishing was retired (ADR-036/037):
// publication_jobs / publication_events remain in the database untouched and unused.
export const publishingLock = tx => tx.execute(sql`SELECT pg_advisory_xact_lock(76210990)`);
