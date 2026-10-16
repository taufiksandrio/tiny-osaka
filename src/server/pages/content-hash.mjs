import { createHash } from "node:crypto";
import { mediaHashSnapshot } from "../media/validation.mjs";

// JSON object key order is not semantic (jsonb reorders keys); array order is.
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
export const hashPageContent = graph => {
  const media = mediaHashSnapshot(graph, "page");
  return createHash("sha256").update(JSON.stringify(canonical({
    format: media ? 2 : 1,
    ...(media ? { media } : {}),
    page: { key: graph.page.key, template: graph.page.template },
    revision: { id: graph.revision.id, pageKey: graph.revision.pageKey, version: graph.revision.version },
    translations: graph.translations.map(row => ({
      revisionId: row.revisionId, locale: row.locale, fields: row.fields,
    })).sort((a, b) => a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0),
  }))).digest("hex");
};

