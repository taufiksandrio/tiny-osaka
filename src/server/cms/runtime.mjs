import "server-only";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getAuthService } from "../auth/runtime.mjs";
import { createCmsPages } from "./pages.mjs";
import { createCmsCatalog } from "./catalog.mjs";
import { getCmsDatabaseConfig } from "./request-policy.mjs";
let services;
const getServices = () => {
  if (!services) {
    if (process.env.PUBLIC_DATABASE_TARGET !== "test" && !process.env.CMS_DATABASE_URL) {
      try { loadEnvFile(".env.cms.local"); } catch { /* Fail closed in config validation. */ }
    }
    const pool = new pg.Pool(getCmsDatabaseConfig());
    pool.on("error", () => console.error("CMS database connection failed."));
    const context = { db: drizzle(pool), authenticate: headers => getAuthService().authenticate(headers) };
    services = { pages: createCmsPages(context), catalog: createCmsCatalog(context) };
  }
  return services;
};
export const getCmsPages = () => getServices().pages;
export const getCmsCatalog = () => getServices().catalog;
