import "server-only";
import pg from "pg";
import { cache } from "react";
import { getPublicSource, getPublicDatabaseConfig } from "./config.mjs";
import { withPublicOrderLinks } from "../catalog/order-links.mjs";
import { getPageDefinition } from "../pages/templates.mjs";
import { validatePageFields } from "../pages/validation.mjs";

export const usesPublishedContent = () => getPublicSource() === "published";
let pool;
const poolKey = Symbol.for("tiny-osaka.public.pool");
const connection = () => {
  if (!pool) {
    pool = globalThis[poolKey];
    if (!pool) {
      pool = new pg.Pool(getPublicDatabaseConfig());
      pool.on("error", () => console.error("Public database connection failed."));
      globalThis[poolKey] = pool;
    }
  }
  return pool;
};
// Only reviewed SQL capabilities are reachable through this reader.
// React cache deduplicates within one server request, never between requests.
// Order links are re-validated here (https + exact-host allowlist) and replaced by `orderLinks: [{ platform, href }]`;
// the raw per-platform URL fields never reach Server or Client Components. `hosts` is injectable for tests.
export const readPublicCatalog = async (client, { hosts } = {}) => {
  const content = (await client.query("SELECT public.public_read_catalog() AS content")).rows[0].content;
  if (!content || !Array.isArray(content.products)) return content;
  return { ...content, products: content.products.map(product => withPublicOrderLinks(product, hosts)) };
};
export const readPublicPage = async (client, key) => {
  if (!getPageDefinition(key)) return null;
  const result = (await client.query("SELECT public.public_read_page($1::text) AS content", [key])).rows[0].content;
  if (!result) return result;
  validatePageFields(key, result.fields, { ready: true });
  return result;
};
export const publicCatalog = cache(() => readPublicCatalog(connection()));
export const publicPage = cache(key => readPublicPage(connection(), key));
// Storage keys returned here stay server-only; browser responses contain bytes.
export const publicMedia = async id => (await connection().query("SELECT public.public_read_media($1::uuid) AS content", [id])).rows[0].content;
