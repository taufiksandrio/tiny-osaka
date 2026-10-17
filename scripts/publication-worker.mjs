import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getCmsDatabaseConfig } from "../src/server/cms/request-policy.mjs";
import { runNextPublication } from "../src/server/publishing/worker.mjs";
// Explicit foreground invocation only; never registers a system service.
if (process.argv.length !== 3 || !["--once", "--watch"].includes(process.argv[2])) {
  console.error("Use --once or --watch with explicit dev/test CMS environment files.");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ ...getCmsDatabaseConfig(), max: 1 });
  let stopping = false;
  pool.on("error", () => { console.error("Publication worker connection failed."); stopping = true; process.exitCode = 1; });
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  try {
    do {
      for (let count = 0; count < 25 && !stopping; count++) {
        const result = await runNextPublication(drizzle(pool));
        if (!result) break;
        console.log(JSON.stringify(result));
      }
      if (process.argv[2] === "--once" || stopping) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    } while (!stopping);
  } catch {
    console.error("Publication worker failed; job remains durable. Check database availability.");
    process.exitCode = 1;
  } finally { await pool.end(); }
}
