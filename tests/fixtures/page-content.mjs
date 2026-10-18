import { randomUUID } from "node:crypto";
import { getPageDefinition, pageTemplateFields } from "../../src/server/pages/templates.mjs";
export const rich = (text = "QA synthetic content") => ({ blocks: [{ type: "paragraph", content: [{ text }] }] });
export const fields = (key = "about") => Object.fromEntries(
  Object.entries(pageTemplateFields[getPageDefinition(key).template]).map(([name, type]) =>
    [name, type === "rich" ? rich() : "QA synthetic " + name]));
export const pageGraph = (key = "about") => {
  const revision = { id: randomUUID(), pageKey: key, version: 3, status: "draft", contentHash: null };
  return { page: { key, template: getPageDefinition(key).template }, revision,
    translations: [{ revisionId: revision.id, locale: "id", fields: fields(key) }] };
};
// Frozen snapshots written before the single-language change still hold an English row; it must stay
// hashable and must be ignored by validation.
export const legacyPageGraph = (key = "about") => {
  const graph = pageGraph(key);
  graph.translations.push({ revisionId: graph.revision.id, locale: "en", fields: fields(key) });
  return graph;
};

