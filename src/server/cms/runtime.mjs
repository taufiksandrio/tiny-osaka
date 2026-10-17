import "server-only";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getAuthService } from "../auth/runtime.mjs";
import { createCmsPages } from "./pages.mjs";
import { getCmsDatabaseConfig } from "./request-policy.mjs";
let pages;
export const getCmsPages = () => {
  if (!pages) {
    if (process.env.PUBLIC_DATABASE_TARGET !== "test" && !process.env.CMS_DATABASE_URL) {
      try { loadEnvFile(".env.cms.local"); } catch { /* Fail closed in config validation. */ }
    }
    const pool = new pg.Pool(getCmsDatabaseConfig());
    pool.on("error", () => console.error("CMS database connection failed."));
    pages = createCmsPages({ db: drizzle(pool), authenticate: headers => getAuthService().authenticate(headers) });
  }
  return pages;
};
