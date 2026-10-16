import { randomUUID } from "node:crypto";
import { getPageDefinition, pageTemplateFields } from "../../src/server/pages/templates.mjs";
export const rich = (text = "QA synthetic content") => ({ blocks: [{ type: "paragraph", content: [{ text }] }] });
export const fields = (key = "about") => Object.fromEntries(
  Object.entries(pageTemplateFields[getPageDefinition(key).template]).map(([name, type]) =>
    [name, type === "rich" ? rich() : "QA synthetic " + name]));
export const pageGraph = (key = "about") => {
  const revision = { id: randomUUID(), pageKey: key, version: 3, status: "draft", contentHash: null };
  return { page: { key, template: getPageDefinition(key).template }, revision,
    translations: ["id", "en"].map(locale => ({ revisionId: revision.id, locale, fields: fields(key) })) };
};

