import "server-only";
import { eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { cmsFail, exactInput } from "./request-policy.mjs";
import { createMediaReferences } from "../media/references.mjs";
import { validPageUuid, validPageVersion } from "../pages/validation.mjs";

const creates = { categoryCreate: "categories", productCreate: "products", variantCreate: "productVariants", groupCreate: "modifierGroups", optionCreate: "modifierOptions" };
const catalogActions = ["categoryCreate", "productCreate", "categoryTranslation", "productTranslation", "categoryPlacement", "productPlacement",
  "variantCreate", "variantUpdate", "variantTranslation", "groupCreate", "groupUpdate", "groupTranslation", "optionCreate", "optionUpdate", "optionTranslation"];
export const saveBatch = async (tx, actor, input, domain, api) => {
  exactInput(input, ["revisionId", "expectedVersion", "operations"]);
  if (!validPageUuid(input.revisionId) || !validPageVersion(input.expectedVersion)) cmsFail("INVALID_INPUT");
  if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > 500) cmsFail("INVALID_INPUT");
  const root = domain === "page" ? s.pageRevisions : s.catalogRevisions;
  // Serialize the entire save before its first edit; nested writers retain their guards.
  const [revision] = await tx.select().from(root).where(eq(root.id, input.revisionId)).for("update");
  if (!revision || revision.status !== "draft" || revision.version !== input.expectedVersion) cmsFail("REVISION_CONFLICT", 409);
  const aliases = new Map(); let version = revision.version;
  const refs = createMediaReferences({ db: tx, resolveActor: async () => actor });
  for (const operation of input.operations) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) cmsFail("INVALID_INPUT");
    exactInput(operation, operation.assign === undefined ? ["action", "data"] : ["action", "data", "assign"]);
    const { action } = operation;
    if (!(domain === "page" ? ["save", "mediaSave", "mediaRemove"] : [...catalogActions, "mediaSave", "mediaRemove"]).includes(action)) cmsFail("INVALID_INPUT");
    if (!operation.data || Array.isArray(operation.data) || typeof operation.data !== "object" ||
      ["revisionId", "expectedVersion"].some(key => Object.hasOwn(operation.data, key))) cmsFail("INVALID_INPUT");
    if (operation.assign !== undefined && (!creates[action] || typeof operation.assign !== "string" ||
      !/^\$[0-9a-f-]{36}$/.test(operation.assign) || aliases.has(operation.assign))) cmsFail("INVALID_INPUT");
    const data = { ...operation.data, revisionId: revision.id, expectedVersion: version };
    for (const key of ["categoryId", "productId", "variantId", "groupId", "optionId"]) {
      if (typeof data[key] === "string" && data[key].startsWith("$")) {
        if (!aliases.has(data[key])) cmsFail("INVALID_INPUT");
        data[key] = aliases.get(data[key]);
      }
    }
    if (action.startsWith("media")) {
      exactInput(data, ["revisionId", "expectedVersion", ...(domain === "catalog" ? ["productId"] : []),
        ...(action === "mediaRemove" ? ["referenceId"] : ["referenceId", "assetId", "altId", "altEn", "captionId", "captionEn", "sortOrder"])]);
      const method = (action === "mediaSave" ? "save" : "remove") + (domain === "page" ? "Page" : "Catalog");
      const result = await refs[method](data); version = result.version;
      await tx.insert(domain === "page" ? s.pageWorkflowEvents : s.catalogWorkflowEvents)
        .values({ revisionId: revision.id, action: "save", actorId: actor.subject });
    } else {
      const table = creates[action];
      const before = operation.assign ? new Set((await api.read(null, revision.id))[table].map(row => row.id)) : null;
      const result = await api.write(null, action, data);
      version = domain === "page" ? result.version : result.revision.version;
      if (operation.assign) {
        const added = result[table].filter(row => !before.has(row.id));
        if (added.length !== 1) cmsFail("INVALID_INPUT");
        aliases.set(operation.assign, added[0].id);
      }
    }
  }
  return api.read(null, revision.id);
};
