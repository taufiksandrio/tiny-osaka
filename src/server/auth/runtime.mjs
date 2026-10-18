import "server-only";
import pg from "pg";
import { loadEnvFile } from "node:process";
import { getAuthConfig } from "./config.mjs";
import { createAuthService } from "./service.mjs";

let service;
const poolKey = Symbol.for("tiny-osaka.auth.pool");
export const getAuthService = () => {
  if (!service) {
    if (!process.env.BETTER_AUTH_SECRET && ["dev", "test"].includes(process.env.PUBLIC_DATABASE_TARGET || "dev")) {
      try { loadEnvFile(".env.auth.local"); } catch { /* Configuration error below stays generic. */ }
    }
    const config = getAuthConfig();
    let pool = globalThis[poolKey];
    if (!pool) {
      pool = new pg.Pool(config.database);
      pool.on("error", () => console.error("Authentication database connection failed."));
      globalThis[poolKey] = pool;
    }
    // Real email delivery is intentionally unwired until a provider is approved.
    service = createAuthService({ pool });
  }
  return service;
};
