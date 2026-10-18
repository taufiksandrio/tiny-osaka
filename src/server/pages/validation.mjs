import { Buffer } from "node:buffer";
import { validateRevisionMedia } from "../media/validation.mjs";
import { getPageDefinition, isInternalPageLink, pageTemplateFields } from "./templates.mjs";

export class PageContentError extends Error {
  constructor(code, message) { super(message); this.name = "PageContentError"; this.code = code; }
}
export const pageFail = (code, message) => { throw new PageContentError(code, message); };
export const validPageUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const validPageVersion = value => Number.isInteger(value) && value >= 1 && value <= 2147483647;
const plain = value => value !== null && typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const keys = (value, allowed, required = allowed) => plain(value) &&
  Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key));
const text = (value, limit, required = false) => typeof value === "string" && value.length <= limit &&
  !value.includes("\0") && (!required || value.trim().length > 0);
const invalid = () => pageFail("INVALID_CONTENT", "Content does not match the fixed page template.");
const limits = { short: 160, title: 240, summary: 2000 };

// Flat bounded document: no arbitrary attributes, raw HTML, styles, scripts,
// external URLs, media or embeds. Text containing angle brackets stays literal.
const validateRich = (document, ready) => {
  if (!keys(document, ["blocks"]) || !Array.isArray(document.blocks) || document.blocks.length > 100) invalid();
  let spans = 0, visible = false;
  const inline = value => {
    if (!Array.isArray(value) || value.length > 100) invalid();
    for (const span of value) {
      if (!keys(span, ["text", "marks", "href"], ["text"]) || !text(span.text, 4000)) invalid();
      spans++;
      if (spans > 1000) invalid();
      if (span.text.trim()) visible = true;
      if (Object.hasOwn(span, "marks") && (!Array.isArray(span.marks) || span.marks.length > 2 ||
        new Set(span.marks).size !== span.marks.length || Array.from(span.marks).some(mark => !["bold", "italic"].includes(mark)))) invalid();
      if (Object.hasOwn(span, "href") && !isInternalPageLink(span.href)) invalid();
    }
  };
  for (const block of document.blocks) {
    if (!plain(block)) invalid();
    if (block.type === "paragraph") {
      if (!keys(block, ["type", "content"])) invalid();
      inline(block.content);
    } else if (block.type === "heading") {
      if (!keys(block, ["type", "level", "content"]) || ![2, 3].includes(block.level)) invalid();
      inline(block.content);
    } else if (block.type === "list") {
      if (!keys(block, ["type", "ordered", "items"]) || typeof block.ordered !== "boolean" ||
        !Array.isArray(block.items) || block.items.length > 100) invalid();
      for (const item of block.items) inline(item);
    } else invalid();
  }
  if (ready && !visible) invalid();
};

export const validatePageFields = (pageKey, fields, { ready = false } = {}) => {
  const definition = getPageDefinition(pageKey);
  if (!definition) pageFail("INVALID_INPUT", "Unknown page.");
  const allowed = pageTemplateFields[definition.template];
  if (!keys(fields, Object.keys(allowed), ready ? ["title", "body"] : [])) invalid();
  // Validate the bounded node/field shape before JSON serialization.
  // Persistence snapshots the validated JSON rather than retaining caller objects.
  for (const [name, value] of Object.entries(fields)) {
    const type = allowed[name];
    if (type === "rich") validateRich(value, ready && name === "body");
    else if (!text(value, limits[type], ready && name === "title")) invalid();
  }
  let bytes;
  try { bytes = Buffer.byteLength(JSON.stringify(fields), "utf8"); } catch { invalid(); }
  // 64 KiB input leaves space for PostgreSQL jsonb formatting under its 128 KiB cap.
  if (bytes > 65536) invalid();
  return true;
};

export const validatePageReadiness = graph => {
  if (!graph || !getPageDefinition(graph.page?.key) || graph.page.template !== getPageDefinition(graph.page.key).template ||
    !validPageUuid(graph.revision?.id) || graph.revision.pageKey !== graph.page.key ||
    !validPageVersion(graph.revision.version) || !Array.isArray(graph.translations) || graph.translations.length < 1) {
    pageFail("NOT_READY", "Require an Indonesian page revision.");
  }
  const rows = graph.translations;
  try {
    if (rows.length !== 1) invalid();
    if (rows[0].revisionId !== graph.revision.id) invalid();
    validatePageFields(graph.page.key, rows[0].fields, { ready: true });
  } catch (error) {
    if (error instanceof PageContentError) pageFail("NOT_READY", "Lengkapi judul dan isi halaman sebelum mengirim review.");
    throw error;
  }
  try { validateRevisionMedia(graph, "page"); }
  catch { pageFail("NOT_READY", "Complete valid media references before submitting."); }
  return true;
};

