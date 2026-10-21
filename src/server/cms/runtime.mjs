import "server-only";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getAuthService } from "../auth/runtime.mjs";
import { createCmsPages } from "./pages.mjs";
import { createCmsCatalog } from "./catalog.mjs";
import { createCmsMedia } from "./media.mjs";
import { getCmsDatabaseConfig } from "./request-policy.mjs";
let services;
const poolKey = Symbol.for("tiny-osaka.cms.pool");
const getServices = () => {
  if (!services) {
    // Local private env file is a dev-only convenience; staging/production read server env only.
    if ((process.env.PUBLIC_DATABASE_TARGET ?? "dev") === "dev" && !process.env.CMS_DATABASE_URL) {
      try { loadEnvFile(".env.cms.local"); } catch { /* Fail closed in config validation. */ }
    }
    // Route bundles may evaluate this module separately. Share one bounded pool
    // across them instead of exhausting the isolated role's connection limit.
    let pool = globalThis[poolKey];
    if (!pool) {
      pool = new pg.Pool(getCmsDatabaseConfig());
      pool.on("error", () => console.error("CMS database connection failed."));
      globalThis[poolKey] = pool;
    }
    const db = drizzle(pool);
    const context = { db, authenticate: headers => getAuthService().authenticate(headers) };
    services = { db, pages: createCmsPages(context), catalog: createCmsCatalog(context), media: createCmsMedia(context) };
  }
  return services;
};
// MCP: the same services bound to an actor already proven by a validated Bearer token (not a cookie session).
// Each service still re-reads enabled membership from the database inside its transaction.
export const createCmsServicesFor = (authenticate, db = getServices().db) => {
  const context = { db, authenticate };
  return { pages: createCmsPages(context), catalog: createCmsCatalog(context), media: createCmsMedia(context) };
};
export const getCmsPages = () => getServices().pages;
export const getCmsCatalog = () => getServices().catalog;
export const getCmsMedia = () => getServices().media;

