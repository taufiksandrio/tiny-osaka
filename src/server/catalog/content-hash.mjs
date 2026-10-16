import { createHash } from "node:crypto";
import { mediaHashSnapshot } from "../media/validation.mjs";

// Explicit format version and column whitelist: workflow metadata is excluded.
export const catalogContentFields = Object.freeze({
  categories: ["id", "slug"], products: ["id", "slug"],
  categoryEntries: ["revisionId", "categoryId", "sortOrder"],
  categoryTranslations: ["revisionId", "categoryId", "locale", "title", "description"],
  productEntries: ["revisionId", "productId", "categoryId", "sortOrder"],
  productTranslations: ["revisionId", "productId", "locale", "title", "description"],
  productVariants: ["revisionId", "productId", "id", "code", "basePrice", "sortOrder"],
  variantTranslations: ["revisionId", "productId", "variantId", "locale", "title", "description"],
  modifierGroups: ["revisionId", "productId", "id", "code", "selectionType", "minSelections", "maxSelections", "sortOrder"],
  modifierGroupTranslations: ["revisionId", "productId", "groupId", "locale", "title", "description"],
  modifierOptions: ["revisionId", "productId", "groupId", "id", "code", "priceDelta", "sortOrder"],
  modifierOptionTranslations: ["revisionId", "productId", "groupId", "optionId", "locale", "title", "description"],
});

export const hashCatalogContent = graph => {
  const media = mediaHashSnapshot(graph, "catalog");
  const rows = Object.entries(catalogContentFields).map(([table, fields]) => {
    if (!Array.isArray(graph[table])) throw new Error("Incomplete catalog graph.");
    const encoded = graph[table].map(row => JSON.stringify(fields.map(field => {
      if (row[field] === undefined) throw new Error("Incomplete catalog row.");
      return row[field];
    }))).sort();
    return [table, encoded];
  });
  return createHash("sha256").update(JSON.stringify({
    format: media ? 2 : 1, revisionId: graph.revision.id, version: graph.revision.version, rows,
    ...(media ? { media } : {}),
  })).digest("hex");
};

