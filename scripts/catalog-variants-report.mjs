import pg from "pg";
import { ReportGuardError, resolveReportUrl, buildReport } from "./lib/catalog-variants-report.mjs";

// Usage: node --env-file=.env.local scripts/catalog-variants-report.mjs
// Local dev database only. Read-only; prints no credentials.
let client;
try {
  client = new pg.Client({ connectionString: resolveReportUrl(), connectionTimeoutMillis: 5000, statement_timeout: 15000, application_name: "tiny-osaka-catalog-report" });
  await client.connect();
  console.log(JSON.stringify(await buildReport(client), null, 2));
} catch (error) {
  console.error(error instanceof ReportGuardError ? error.message : "Report failed; no raw error or credentials logged.");
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
