import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { roles } from "../db/auth-schema.mjs";
import * as drafts from "../catalog/drafts.mjs";
import { createCatalogWorkflow } from "../catalog/workflow.mjs";
import { loadCatalogGraph, getCatalogReviewReadiness } from "../catalog/review.mjs";
import { validPageUuid } from "../pages/validation.mjs";
import { cmsFail, exactInput } from "./request-policy.mjs";
import { assetDto } from "./media.mjs";

const scope = ["revisionId", "expectedVersion"];
const translation = ["locale", "title", "description"];
const operations = {
  create: [[], "createCatalogDraft"],
  clone: [["sourceRevisionId", "expectedSourceVersion"], "cloneCatalogDraft"],
  categoryCreate: [[...scope, "slug", "sortOrder"], "createCatalogCategory"],
  productCreate: [[...scope, "categoryId", "slug", "sortOrder"], "createCatalogProduct"],
  categoryTranslation: [[...scope, "categoryId", ...translation], "saveCategoryTranslation"],
  productTranslation: [[...scope, "productId", ...translation], "saveProductTranslation"],
  categoryPlacement: [[...scope, "categoryId", "sortOrder"], "updateCategoryPlacement"],
  productPlacement: [[...scope, "productId", "categoryId", "sortOrder"], "updateProductPlacement"],
  variantCreate: [[...scope, "productId", "code", "basePrice", "sortOrder"], "createProductVariant"],
  variantUpdate: [[...scope, "productId", "variantId", "code", "basePrice", "sortOrder"], "updateProductVariant"],
  variantTranslation: [[...scope, "productId", "variantId", ...translation], "saveVariantTranslation"],
  groupCreate: [[...scope, "productId", "code", "selectionType", "minSelections", "maxSelections", "sortOrder"], "createModifierGroup"],
  groupUpdate: [[...scope, "productId", "groupId", "code", "selectionType", "minSelections", "maxSelections", "sortOrder"], "updateModifierGroup"],
  groupTranslation: [[...scope, "productId", "groupId", ...translation], "saveModifierGroupTranslation"],
  optionCreate: [[...scope, "productId", "groupId", "code", "priceDelta", "sortOrder"], "createModifierOption"],
  optionUpdate: [[...scope, "productId", "groupId", "optionId", "code", "priceDelta", "sortOrder"], "updateModifierOption"],
  optionTranslation: [[...scope, "productId", "groupId", "optionId", ...translation], "saveModifierOptionTranslation"],
  readiness: [scope, "readiness"], submit: [scope, "submit"],
  ...Object.fromEntries(["approve", "reject", "publish", "archive"].map(action => [action, [[...scope, "expectedHash"], action]])),
};
export const createCmsCatalog = ({ db, authenticate }) => {
  const run = async (headers, callback) => {
    const actor = await authenticate(headers);
    if (!actor) cmsFail("AUTH_REQUIRED", 401);
    return db.transaction(async tx => {
      const [member] = await tx.select().from(roles).where(and(eq(roles.userId, actor.subject), eq(roles.enabled, true)));
      if (!member || !["owner", "staff"].includes(member.role)) cmsFail("AUTH_REQUIRED", 401);
      return callback(tx, { subject: actor.subject, role: member.role });
    }, { isolationLevel: "repeatable read" });
  };
  const revision = async (tx, id) => {
    if (!validPageUuid(id)) cmsFail("INVALID_INPUT");
    const [row] = await tx.select().from(s.catalogRevisions).where(eq(s.catalogRevisions.id, id));
    if (!row) cmsFail("NOT_FOUND", 404);
    return row;
  };
  const read = async (tx, id) => {
    const row = await revision(tx, id);
    const graph = await loadCatalogGraph(tx, row);
    const [live] = await tx.select().from(s.catalogPublication).where(eq(s.catalogPublication.id, 1));
    return { ...graph, mediaAssets: graph.mediaAssets.map(assetDto), isLive: live?.revisionId === row.id };
  };
  return Object.freeze({
    list: headers => run(headers, async tx => {
      const rows = await tx.select().from(s.catalogRevisions).orderBy(desc(s.catalogRevisions.createdAt), desc(s.catalogRevisions.id)).limit(100);
      const [live] = await tx.select().from(s.catalogPublication).where(eq(s.catalogPublication.id, 1));
      return { rows, publishedRevisionId: live?.revisionId ?? null };
    }),
    read: (headers, id) => run(headers, tx => read(tx, id)),
    write: (headers, action, input) => run(headers, async (tx, actor) => {
      if (!Object.hasOwn(operations, action)) cmsFail("INVALID_INPUT");
      const [fields, method] = operations[action];
      exactInput(input, fields);
      for (const [key, value] of Object.entries(input)) {
        if (["slug", "code"].includes(key) && (typeof value !== "string" || value.length > 160)) cmsFail("INVALID_INPUT");
        if (key === "title" && (typeof value !== "string" || value.length > 240)) cmsFail("INVALID_INPUT");
        if (key === "description" && (typeof value !== "string" || value.length > 2000)) cmsFail("INVALID_INPUT");
      }
      if (method === "readiness") return getCatalogReviewReadiness(tx, input);
      let result;
      if (Object.hasOwn(drafts, method) && method !== "CatalogDraftError") {
        result = await drafts[method](tx, input);
        await tx.insert(s.catalogWorkflowEvents).values({ revisionId: result.revisionId ?? result.id,
          action: ["create", "clone"].includes(action) ? action : "save", actorId: actor.subject });
      } else result = await createCatalogWorkflow({ db: tx, resolveActor: async () => actor })[method](input);
      return read(tx, result.revisionId ?? result.id);
    }),
  });
};
