import "server-only";
import { eq } from "drizzle-orm";
import * as s from "../db/schema.mjs";
import { MediaError, mediaFail, validMediaUuid, validStorageKey, validYoutubeId, validateMediaAsset } from "./validation.mjs";

export const mediaPersistence = error => {
  if (error instanceof MediaError) throw error;
  if ([error?.code, error?.cause?.code].some(code => ["40001", "40P01"].includes(code))) mediaFail("REVISION_CONFLICT", "Draft changed concurrently.");
  mediaFail("PERSISTENCE_FAILED", "Media operation failed; no driver details exposed.");
};
export const resolveMediaActor = async resolveActor => {
  let actor;
  try { actor = typeof resolveActor === "function" ? await resolveActor() : null; }
  catch { mediaFail("AUTH_REQUIRED", "Authenticated server identity required."); }
  if (!actor || typeof actor.subject !== "string" || !actor.subject.trim() || actor.subject.length > 200 ||
    actor.subject.includes("\0") || !["staff", "owner"].includes(actor.role)) {
    mediaFail("AUTH_REQUIRED", "Authenticated server identity required.");
  }
  return actor;
};
// Adapters are trusted server capabilities, never callback/metadata request fields.
// No file access/network/decoder/storage provider is implemented by this module.
export const createMediaAssets = ({ db, resolveActor, inspectFile } = {}) => {
  const persist = async (values, actor) => {
    try {
      return await db.transaction(async tx => {
        if (values.posterId) {
          // Assets cannot be updated/deleted. A plain read plus the FK is enough;
          // FOR SHARE would unnecessarily require UPDATE privilege on originals.
          const [poster] = await tx.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, values.posterId));
          if (!poster || poster.kind !== "image") mediaFail("INVALID_POSTER", "Video requires a registered image poster.");
        }
        const [asset] = await tx.insert(s.mediaAssets).values(values).returning();
        await tx.insert(s.mediaEvents).values({ assetId: asset.id, action: "register", actorId: actor.subject });
        return asset;
      });
    } catch (error) { mediaPersistence(error); }
  };
  return Object.freeze({
    registerFile: async input => {
      const actor = await resolveMediaActor(resolveActor);
      if (!validStorageKey(input?.storageKey) || (input.posterId != null && !validMediaUuid(input.posterId))) {
        mediaFail("INVALID_INPUT", "Require an opaque storage key and valid poster ID.");
      }
      if (typeof inspectFile !== "function") mediaFail("INSPECTION_REQUIRED", "Trusted file inspection adapter is not connected.");
      const storageKey = input.storageKey, posterId = input.posterId ?? null;
      let report;
      try { report = await inspectFile(storageKey, Object.freeze({ subject: actor.subject, role: actor.role })); }
      catch { mediaFail("INSPECTION_FAILED", "Trusted media inspection failed."); }
      if (!report || report.verified !== true || report.storageKey !== storageKey) mediaFail("INSPECTION_FAILED", "Verified inspection for the exact key required.");
      const values = { storageKey, kind: typeof report.mime === "string" && report.mime.startsWith("image/") ? "image" : "video",
        mime: report.mime, byteSize: report.byteSize, width: report.width, height: report.height,
        durationMs: report.durationMs, checksum: report.checksum, externalId: null, posterId };
      // Validate without accepting any request-supplied MIME, size or checksum.
      validateMediaAsset({ id: "00000000-0000-0000-0000-000000000000", ...values });
      return persist(values, actor);
    },
    registerYoutube: async input => {
      const actor = await resolveMediaActor(resolveActor);
      if (!validYoutubeId(input?.videoId) || !validMediaUuid(input?.posterId)) mediaFail("INVALID_INPUT", "Require a YouTube video ID and registered image poster.");
      return persist({ kind: "youtube", externalId: input.videoId, posterId: input.posterId,
        storageKey: null, mime: null, byteSize: null, width: null, height: null, durationMs: null, checksum: null }, actor);
    },
  });
};

