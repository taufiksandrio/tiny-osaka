// Approved application policy; decimal MB, no storage or decoder implementation.
export const mediaPolicy = Object.freeze({
  imageBytes: 10000000, imageSide: 4096,
  videoBytes: 100000000, videoLongSide: 1920, videoShortSide: 1080, videoDurationMs: 120000,
  references: 12, altLength: 500, captionLength: 2000,
});
export const mediaMimeExtensions = Object.freeze({
  "image/jpeg": Object.freeze(["jpg", "jpeg"]), "image/png": Object.freeze(["png"]),
  "image/webp": Object.freeze(["webp"]), "video/mp4": Object.freeze(["mp4"]), "video/webm": Object.freeze(["webm"]),
});
export const mediaAssetFields = Object.freeze(["id", "kind", "storageKey", "mime", "byteSize", "width", "height",
  "durationMs", "checksum", "externalId", "posterId"]);
export const mediaRefFields = Object.freeze(["revisionId", "id", "assetId", "altId", "altEn", "captionId", "captionEn", "sortOrder"]);

