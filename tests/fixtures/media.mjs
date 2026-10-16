import { randomUUID } from "node:crypto";
export const imageAsset = (overrides = {}) => ({
  id: randomUUID(), kind: "image", storageKey: randomUUID() + ".png", mime: "image/png",
  byteSize: 1000, width: 800, height: 600, durationMs: null, checksum: "a".repeat(64),
  externalId: null, posterId: null, ...overrides,
});
export const inspectedImage = storageKey => ({ storageKey, mime: "image/png", byteSize: 1000,
  width: 800, height: 600, durationMs: null, checksum: "a".repeat(64), verified: true });
export const reference = (revisionId, assetId, overrides = {}) => ({
  revisionId, id: randomUUID(), assetId, altId: "QA gambar", altEn: "QA image", captionId: "",
  captionEn: "", sortOrder: 0, ...overrides,
});

