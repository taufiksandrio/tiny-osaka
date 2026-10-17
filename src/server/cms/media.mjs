import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { roles } from "../db/auth-schema.mjs";
import { createMediaAssets } from "../media/assets.mjs";
import { createMediaReferences } from "../media/references.mjs";
import { validMediaUuid } from "../media/validation.mjs";
import { createLocalStorage, videoAvailable } from "../media/storage.mjs";
import { cmsFail, exactInput } from "./request-policy.mjs";

export const assetDto = row => ({ id: row.id, kind: row.kind, mime: row.mime, width: row.width, height: row.height,
  byteSize: row.byteSize, durationMs: row.durationMs, posterId: row.posterId, externalId: row.externalId });
export const createCmsMedia = ({ db, authenticate, storage = createLocalStorage(), env = process.env }) => {
  const run = async (headers, callback) => {
    const actor = await authenticate(headers);
    if (!actor) cmsFail("AUTH_REQUIRED", 401);
    return db.transaction(async tx => {
      const [member] = await tx.select().from(roles).where(and(eq(roles.userId, actor.subject), eq(roles.enabled, true)));
      if (!member || !["staff", "owner"].includes(member.role)) cmsFail("AUTH_REQUIRED", 401);
      return callback(tx, { subject: actor.subject, role: member.role });
    });
  };
  const asset = async (tx, id) => {
    if (!validMediaUuid(id)) cmsFail("NOT_FOUND", 404);
    const [row] = await tx.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, id));
    if (!row) cmsFail("NOT_FOUND", 404);
    return row;
  };
  return {
    list: (headers, { offset = 0 } = {}) => run(headers, async tx => {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) cmsFail("INVALID_INPUT");
      const rows = await tx.select().from(s.mediaAssets).orderBy(desc(s.mediaAssets.createdAt), desc(s.mediaAssets.id)).limit(49).offset(offset);
      return { rows: rows.slice(0, 48).map(assetDto), nextOffset: rows.length > 48 ? offset + 48 : null, videoReady: await videoAvailable(env) };
    }),
    file: (headers, id, stream = false) => run(headers, async tx => { const row = await asset(tx, id); return { asset: assetDto(row), ...(stream ? await storage.delivery(row) : { bytes: await storage.read(row) }) }; }),
    upload: async (headers, body, mime, posterId = null) => {
      let received, registered = false;
      try {
        return await run(headers, async (tx, actor) => {
          if (mime.startsWith("video/")) {
            if (!validMediaUuid(posterId) || (await asset(tx, posterId)).kind !== "image") cmsFail("INVALID_POSTER");
          } else if (posterId !== null) cmsFail("INVALID_INPUT");
          received = await storage.receive(body, mime);
          const api = createMediaAssets({ db: tx, resolveActor: async () => actor, inspectFile: async key => {
            if (key !== received.report.storageKey) cmsFail("INVALID_INPUT");
            return received.report;
          } });
          const row = await api.registerFile({ storageKey: received.report.storageKey, posterId });
          registered = true;
          return assetDto(row);
        });
      } catch (error) {
        // A lost COMMIT acknowledgement is ambiguous. Retain bytes once metadata
        // registration finished, rather than deleting a possibly committed asset.
        if (received && !registered) await received.discard().catch(() => {});
        throw error;
      }
    },
    youtube: (headers, input) => run(headers, async (tx, actor) => {
      exactInput(input, ["videoId", "posterId"]);
      return assetDto(await createMediaAssets({ db: tx, resolveActor: async () => actor }).registerYoutube(input));
    }),
    references: (headers, domain, revisionId, productId = null) => run(headers, async tx => {
      if (!["page", "catalog"].includes(domain) || !validMediaUuid(revisionId) || (domain === "catalog" && !validMediaUuid(productId))) cmsFail("INVALID_INPUT");
      const table = domain === "page" ? s.pageMediaRefs : s.catalogMediaRefs;
      const refs = await tx.select().from(table).where(and(eq(table.revisionId, revisionId), ...(domain === "catalog" ? [eq(table.productId, productId)] : [])));
      const items = [];
      for (const ref of refs) items.push({ ...ref, asset: assetDto(await asset(tx, ref.assetId)) });
      return items.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    }),
    reference: (headers, domain, action, input) => run(headers, async (tx, actor) => {
      if (!["page", "catalog"].includes(domain) || !["save", "remove"].includes(action)) cmsFail("INVALID_INPUT");
      const fields = ["revisionId", "expectedVersion", ...(domain === "catalog" ? ["productId"] : []),
        ...(action === "remove" ? ["referenceId"] : ["assetId", "referenceId", "altId", "altEn", "captionId", "captionEn", "sortOrder"])];
      exactInput(input, fields);
      const refs = createMediaReferences({ db: tx, resolveActor: async () => actor });
      const method = action + (domain === "page" ? "Page" : "Catalog");
      const result = await refs[method](input);
      const events = domain === "page" ? s.pageWorkflowEvents : s.catalogWorkflowEvents;
      await tx.insert(events).values({ revisionId: input.revisionId, action: "save", actorId: actor.subject });
      return result;
    }),
  };
};
