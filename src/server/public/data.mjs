import "server-only";
import pg from "pg";
import { cache } from "react";
import { getPublicSource, getPublicDatabaseConfig } from "./config.mjs";
import { getPageDefinition, isPageLocale } from "../pages/templates.mjs";
import { validatePageFields } from "../pages/validation.mjs";

export const usesPublishedContent = () => getPublicSource() === "published";
let pool;
const connection = () => {
  if (!pool) {
    pool = new pg.Pool(getPublicDatabaseConfig());
    pool.on("error", () => console.error("Public database connection failed."));
  }
  return pool;
};
// Only the two reviewed SQL functions are reachable through this reader.
// React cache deduplicates within one server request, never between requests.
export const readPublicCatalog = async (client, locale) => {
  if (!isPageLocale(locale)) return null;
  return (await client.query("SELECT public.public_read_catalog($1::text) AS content", [locale])).rows[0].content;
};
export const readPublicPage = async (client, key, locale) => {
  if (!getPageDefinition(key) || !isPageLocale(locale)) return null;
  const result = (await client.query("SELECT public.public_read_page($1::text,$2::text) AS content", [key, locale])).rows[0].content;
  if (result) validatePageFields(key, locale, result.fields, { ready: true });
  return result;
};
export const publicCatalog = cache(locale => readPublicCatalog(connection(), locale));
export const publicPage = cache((key, locale) => readPublicPage(connection(), key, locale));
