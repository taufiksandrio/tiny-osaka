import { randomUUID } from "node:crypto";
export const imageAsset = (overrides = {}) => ({
  id: randomUUID(), kind: "image", storageKey: randomUUID() + ".png", mime: "image/png",
  byteSize: 1000, width: 800, height: 600, durationMs: null, checksum: "a".repeat(64),
  externalId: null, posterId: null, ...overrides,
});
export const inspectedImage = storageKey => ({ storageKey, mime: "image/png", byteSize: 1000,
  width: 800, height: 600, durationMs: null, checksum: "a".repeat(64), verified: true });
export const reference = (revisionId, assetId, overrides = {}) => ({
  // altEn/captionEn are legacy columns that always hold the database default now; they remain only
  // because the media hash format of old snapshots includes them.
  revisionId, id: randomUUID(), assetId, altId: "QA gambar", altEn: "", captionId: "",
  captionEn: "", sortOrder: 0, ...overrides,
});

