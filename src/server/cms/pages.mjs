import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { roles } from "../db/auth-schema.mjs";
import { createPageWorkflow } from "../pages/workflow.mjs";
import { pageDefinitions, getPageDefinition } from "../pages/templates.mjs";
import { validPageUuid } from "../pages/validation.mjs";
import { cmsFail, exactInput } from "./request-policy.mjs";

export const createCmsPages = ({ db, authenticate }) => {
  const run = async (headers, callback) => {
    const actor = await authenticate(headers);
    if (!actor) cmsFail("AUTH_REQUIRED", 401);
    return db.transaction(async tx => {
      // Recheck enabled membership inside the content transaction, using server identity.
      const [member] = await tx.select().from(roles).where(and(eq(roles.userId, actor.subject), eq(roles.enabled, true)));
      if (!member || !["owner", "staff"].includes(member.role)) cmsFail("AUTH_REQUIRED", 401);
      const trusted = { subject: actor.subject, role: member.role };
      return callback(tx, trusted);
    }, { isolationLevel: "repeatable read" });
  };
  const revision = async (tx, id) => {
    if (!validPageUuid(id)) cmsFail("INVALID_INPUT");
    const [row] = await tx.select().from(s.pageRevisions).where(eq(s.pageRevisions.id, id));
    if (!row) cmsFail("NOT_FOUND", 404);
    return row;
  };
  return Object.freeze({
    list: headers => run(headers, async tx => {
      const publications = await tx.select().from(s.pagePublications);
      return Object.values(pageDefinitions).map(page => ({ ...page,
        publishedRevisionId: publications.find(row => row.pageKey === page.key)?.revisionId ?? null }));
    }),
    revisions: (headers, pageKey) => run(headers, async tx => {
      if (!getPageDefinition(pageKey)) cmsFail("NOT_FOUND", 404);
      const rows = await tx.select().from(s.pageRevisions).where(eq(s.pageRevisions.pageKey, pageKey))
        .orderBy(desc(s.pageRevisions.createdAt), desc(s.pageRevisions.id)).limit(100);
      const [live] = await tx.select().from(s.pagePublications).where(eq(s.pagePublications.pageKey, pageKey));
      return { rows, publishedRevisionId: live?.revisionId ?? null };
    }),
    read: (headers, id) => run(headers, async tx => {
      const row = await revision(tx, id);
      const translations = await tx.select().from(s.pageTranslations).where(eq(s.pageTranslations.revisionId, id));
      const [live] = await tx.select().from(s.pagePublications).where(eq(s.pagePublications.pageKey, row.pageKey));
      return { ...row, translations, isLive: live?.revisionId === id };
    }),
    write: (headers, action, input) => run(headers, async (tx, actor) => {
      const fields = { create: ["pageKey"], save: ["revisionId", "expectedVersion", "locale", "fields"],
        clone: ["sourceRevisionId", "expectedSourceVersion"], submit: ["revisionId", "expectedVersion"],
        approve: ["revisionId", "expectedVersion", "expectedHash"], reject: ["revisionId", "expectedVersion", "expectedHash"],
        publish: ["revisionId", "expectedVersion", "expectedHash"], archive: ["revisionId", "expectedVersion", "expectedHash"] };
      if (!Object.hasOwn(fields, action)) cmsFail("INVALID_INPUT");
      exactInput(input, fields[action]);
      const api = createPageWorkflow({ db: tx, resolveActor: async () => actor });
      const method = { create: "createDraft", save: "saveTranslation", clone: "cloneDraft" }[action] ?? action;
      const result = await api[method](input);
      if (["create", "save", "clone"].includes(action)) await tx.insert(s.pageWorkflowEvents).values({
        revisionId: result.revisionId ?? result.id, action, actorId: actor.subject,
      });
      return revision(tx, result.revisionId ?? result.id);
    }),
  });
};
