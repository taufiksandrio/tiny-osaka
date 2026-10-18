// Read-only pre-check before migration 0016 (ADR-039). Usage:
//   node --env-file=.env.test-migrator.local scripts/precheck-drop-language.mjs test
//   node --env-file=.env.dev-migrator.local  scripts/precheck-drop-language.mjs dev
// Prints counts and non-sensitive identifiers only. Runs inside BEGIN READ ONLY and always rolls back.
import { connectTestOwner } from "./lib/test-db.mjs";
import { connectDevOwner } from "./lib/dev-db.mjs";
import { allTables } from "./lib/test-migration-plan.mjs";
import { resetTables, retainedTables, countRows, formatCounts } from "./lib/reset-local-content.mjs";
import { countLegacyLanguageRows } from "./lib/language-removal-protection.mjs";

const target = process.argv[2];
if (!["test", "dev"].includes(target)) { console.error("Usage: precheck-drop-language.mjs <test|dev>"); process.exit(2); }
let client;
try {
  client = await (target === "test" ? connectTestOwner() : connectDevOwner());
  await client.query("BEGIN READ ONLY");
  const { rows: [history] } = await client.query("SELECT count(*)::integer AS total FROM drizzle.__drizzle_migrations");
  console.log(`${target}: applied migrations = ${history.total} (expected 16 before 0016)`);
  if (history.total === 16) {
    for (const [table, row] of Object.entries(await countLegacyLanguageRows(client))) console.log(`${target}: ${table}`, JSON.stringify(row));
  }
  const counts = await countRows(client);
  console.log(`${target}: rows to delete: ${formatCounts(counts, resetTables)}`);
  console.log(`${target}: rows kept: ${formatCounts(counts, retainedTables)}`);
  const { rows: jobs } = await client.query("SELECT status, count(*)::integer AS total FROM public.publication_jobs GROUP BY 1 ORDER BY 1");
  console.log(`${target}: publication_jobs by status`, JSON.stringify(jobs));
  const { rows: actors } = await client.query(`SELECT approved_by FROM public.catalog_approvals UNION SELECT approved_by FROM public.page_approvals ORDER BY 1`);
  console.log(`${target}: approval actors`, JSON.stringify(actors.map(row => row.approved_by)));
  const { rows: slugs } = await client.query("SELECT slug FROM public.products ORDER BY 1");
  console.log(`${target}: product slugs`, JSON.stringify(slugs.map(row => row.slug)));
  const { rows: pages } = await client.query("SELECT key FROM public.pages ORDER BY 1");
  console.log(`${target}: page keys`, JSON.stringify(pages.map(row => row.key)));
  const { rows: [auth] } = await client.query("SELECT (SELECT count(*) FROM cms_auth.users)::integer AS users, (SELECT count(*) FROM cms_auth.roles)::integer AS roles");
  console.log(`${target}: cms_auth rows kept`, JSON.stringify(auth), `tables checked: ${allTables.length}`);
  await client.query("ROLLBACK");
} catch {
  console.error("Pre-check failed; no raw errors or credentials logged.");
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
