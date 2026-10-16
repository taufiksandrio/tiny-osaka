import "server-only";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDatabaseConfig } from "./config.mjs";
import * as schema from "./schema.mjs";

// Explicit factory: importing the module or building the site does not connect.
// The future server consumer owns reuse and shutdown of this client.
export const createDatabaseClient = (env = process.env, target = "dev") => {
  const pool = new pg.Pool(getDatabaseConfig(env, target));
  pool.on("error", () => console.error("Database idle connection failed."));
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
};
