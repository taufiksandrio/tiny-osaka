import "server-only";
import pg from "pg";
import { cache } from "react";
import { getPublicSource, getPublicDatabaseConfig } from "./config.mjs";
import { getPageDefinition, isPageLocale } from "../pages/templates.mjs";
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
const PUBLIC_LOCALE = "id"; // Single-language site; the SQL readers keep their legacy locale argument until stage 2.
export const readPublicCatalog = async (client, locale = PUBLIC_LOCALE) => {
  if (!isPageLocale(locale)) return null;
  return (await client.query("SELECT public.public_read_catalog($1::text) AS content", [locale])).rows[0].content;
};
export const readPublicPage = async (client, key, locale = PUBLIC_LOCALE) => {
  if (!getPageDefinition(key) || !isPageLocale(locale)) return null;
  const result = (await client.query("SELECT public.public_read_page($1::text,$2::text) AS content", [key, locale])).rows[0].content;
  if (result) validatePageFields(key, locale, result.fields, { ready: true });
  return result;
};
export const publicCatalog = cache(() => readPublicCatalog(connection(), PUBLIC_LOCALE));
export const publicPage = cache(key => readPublicPage(connection(), key, PUBLIC_LOCALE));
// Storage keys returned here stay server-only; browser responses contain bytes.
export const publicMedia = async id => (await connection().query("SELECT public.public_read_media($1::uuid) AS content", [id])).rows[0].content;
