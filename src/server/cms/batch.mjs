import "server-only";
import { eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { cmsFail, exactInput } from "./request-policy.mjs";
import { createMediaReferences } from "../media/references.mjs";
import { createPageWorkflow } from "../pages/workflow.mjs";
import { validPageUuid, validPageVersion } from "../pages/validation.mjs";

// Direct page editor only (ADR-036). Catalog cards no longer use revision batches (ADR-037).
export const saveBatch = async (tx, actor, input) => {
  exactInput(input, ["revisionId", "expectedVersion", "operations"]);
  if (!validPageUuid(input.revisionId) || !validPageVersion(input.expectedVersion)) cmsFail("INVALID_INPUT");
  if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > 500) cmsFail("INVALID_INPUT");
  // Serialize the entire save before its first edit; nested writers retain their guards.
  const [revision] = await tx.select().from(s.pageRevisions).where(eq(s.pageRevisions.id, input.revisionId)).for("update");
  if (!revision || revision.status !== "draft" || revision.version !== input.expectedVersion) cmsFail("REVISION_CONFLICT", 409);
  let version = revision.version;
  const refs = createMediaReferences({ db: tx, resolveActor: async () => actor });
  const workflow = createPageWorkflow({ db: tx, resolveActor: async () => actor });
  for (const operation of input.operations) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) cmsFail("INVALID_INPUT");
    exactInput(operation, ["action", "data"]);
    const { action } = operation;
    if (!["save", "mediaSave", "mediaRemove"].includes(action)) cmsFail("INVALID_INPUT");
    if (!operation.data || Array.isArray(operation.data) || typeof operation.data !== "object" ||
      ["revisionId", "expectedVersion"].some(key => Object.hasOwn(operation.data, key))) cmsFail("INVALID_INPUT");
    const data = { ...operation.data, revisionId: revision.id, expectedVersion: version };
    if (action === "save") {
      exactInput(data, ["revisionId", "expectedVersion", "locale", "fields"]);
      if (data.locale !== "id") cmsFail("INVALID_INPUT");
      version = (await workflow.saveTranslation(data)).version;
    } else {
      exactInput(data, ["revisionId", "expectedVersion", ...(action === "mediaRemove" ? ["referenceId"] : ["referenceId", "assetId", "altId", "altEn", "captionId", "captionEn", "sortOrder"])]);
      version = (await refs[action === "mediaSave" ? "savePage" : "removePage"](data)).version;
    }
    await tx.insert(s.pageWorkflowEvents).values({ revisionId: revision.id, action: "save", actorId: actor.subject });
  }
  return { revisionId: revision.id, version };
};
