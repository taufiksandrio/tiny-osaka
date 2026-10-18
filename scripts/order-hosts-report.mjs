import pg from "pg";
import { ReportGuardError, resolveReportUrl } from "./lib/catalog-variants-report.mjs";
import { summarizeOrderHosts, orderLinkRowsQuery } from "./lib/order-hosts-report.mjs";

// Usage: node --env-file=.env.cms.local scripts/order-hosts-report.mjs
// Local dev database only. Read-only (READ ONLY transaction); prints hostnames and counts, never full URLs or credentials.
let client;
try {
  client = new pg.Client({ connectionString: resolveReportUrl(), connectionTimeoutMillis: 5000, statement_timeout: 15000, application_name: "tiny-osaka-order-hosts-report" });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query(orderLinkRowsQuery);
  await client.query("ROLLBACK");
  console.log(JSON.stringify(summarizeOrderHosts(rows), null, 2));
} catch (error) {
  console.error(error instanceof ReportGuardError ? error.message : "Report failed; no raw error or credentials logged.");
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
