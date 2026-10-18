import { mediaAssetFields, mediaMimeExtensions, mediaPolicy as p, mediaRefFields } from "./policy.mjs";

export class MediaError extends Error {
  constructor(code, message) { super(message); this.name = "MediaError"; this.code = code; }
}
export const mediaFail = (code, message) => { throw new MediaError(code, message); };
export const validMediaUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const validMediaVersion = value => Number.isInteger(value) && value >= 1 && value < 2147483647;
export const validStorageKey = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|webm)$/.test(value);
export const validYoutubeId = value => typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
const integer = (value, max) => Number.isInteger(value) && value > 0 && value <= max;
const invalid = () => mediaFail("INVALID_MEDIA", "Media does not match the approved policy.");
const nullFields = (asset, fields) => fields.every(field => asset[field] === null);
export const validateMediaAsset = asset => {
  if (!asset || !validMediaUuid(asset.id)) invalid();
  if (asset.kind === "youtube") {
    if (!validYoutubeId(asset.externalId) || !validMediaUuid(asset.posterId) ||
      !nullFields(asset, ["storageKey", "mime", "byteSize", "width", "height", "durationMs", "checksum"])) invalid();
    return true;
  }
  if (!["image", "video"].includes(asset.kind) || !validStorageKey(asset.storageKey) ||
    !Object.hasOwn(mediaMimeExtensions, asset.mime) || !mediaMimeExtensions[asset.mime].includes(asset.storageKey.split(".").at(-1)) ||
    typeof asset.checksum !== "string" || !/^[0-9a-f]{64}$/.test(asset.checksum) || asset.externalId !== null) invalid();
  if (asset.kind === "image") {
    if (!asset.mime.startsWith("image/") || !integer(asset.byteSize, p.imageBytes) ||
      !integer(asset.width, p.imageSide) || !integer(asset.height, p.imageSide) ||
      asset.durationMs !== null || asset.posterId !== null) invalid();
  } else if (!asset.mime.startsWith("video/") || !integer(asset.byteSize, p.videoBytes) ||
    !integer(asset.width, p.videoLongSide) || !integer(asset.height, p.videoLongSide) ||
    Math.min(asset.width, asset.height) > p.videoShortSide || !integer(asset.durationMs, p.videoDurationMs) ||
    !validMediaUuid(asset.posterId)) invalid();
  return true;
};
export const validateMediaRefText = (input, ready = false) => {
  for (const [key, max] of [["altId", p.altLength], ["captionId", p.captionLength]]) {
    if (typeof input[key] !== "string" || input[key].length > max || input[key].includes("\0") ||
      (ready && key === "altId" && !input[key].trim())) invalid();
  }
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 2147483647) invalid();
};

// Empty/absent media preserves the previous graph/hash contract. A partially
// loaded media graph fails closed; loaders always provide both arrays.
export const validateRevisionMedia = (graph, domain, { ready = true } = {}) => {
  if (!graph || typeof graph !== "object" || !["catalog", "page"].includes(domain)) invalid();
  if (graph.mediaRefs === undefined && graph.mediaAssets === undefined) return true;
  if (!Array.isArray(graph.mediaRefs) || !Array.isArray(graph.mediaAssets)) invalid();
  if (graph.mediaRefs.length && !validMediaUuid(graph.revision?.id)) invalid();
  const assets = new Map(), refs = new Set(), required = new Set(), counts = new Map();
  for (const asset of graph.mediaAssets) {
    validateMediaAsset(asset);
    if (assets.has(asset.id)) invalid();
    assets.set(asset.id, asset);
  }
  for (const ref of graph.mediaRefs) {
    if (!ref || !validMediaUuid(ref.id) || refs.has(ref.id) || ref.revisionId !== graph.revision.id || !assets.has(ref.assetId)) invalid();
    refs.add(ref.id); required.add(ref.assetId);
    validateMediaRefText(ref, ready);
    const scope = domain === "catalog" ? ref.productId : graph.revision.id;
    if (domain === "catalog" && (!validMediaUuid(scope) || !Array.isArray(graph.productEntries) ||
      !graph.productEntries.some(row => row?.productId === scope && row?.revisionId === graph.revision.id))) invalid();
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
    if (counts.get(scope) > p.references) invalid();
    const asset = assets.get(ref.assetId);
    if (asset.posterId !== null) {
      const poster = assets.get(asset.posterId);
      if (!poster || poster.kind !== "image") invalid();
      required.add(poster.id);
    }
  }
  if (required.size !== assets.size) invalid();
  return true;
};
export const mediaHashSnapshot = (graph, domain) => {
  validateRevisionMedia(graph, domain);
  if (!graph.mediaRefs?.length) return null;
  const encode = (rows, fields) => rows.map(row => fields.map(field => {
    if (row[field] === undefined) invalid();
    return row[field];
  })).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  return { refs: encode(graph.mediaRefs, domain === "catalog" ? [...mediaRefFields, "productId"] : mediaRefFields),
    assets: encode(graph.mediaAssets, mediaAssetFields) };
};
export const publicRevisionMedia = (graph, domain) => {
  validateRevisionMedia(graph, domain);
  const assets = new Map((graph.mediaAssets ?? []).map(row => [row.id, row]));
  const dto = asset => ({ id: asset.id, kind: asset.kind, width: asset.width, height: asset.height,
    durationMs: asset.durationMs, externalId: asset.externalId });
  return [...(graph.mediaRefs ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map(ref => {
    const asset = assets.get(ref.assetId);
    return { id: ref.id, ...(domain === "catalog" ? { productId: ref.productId } : {}),
      sortOrder: ref.sortOrder, alt: ref.altId, caption: ref.captionId, asset: dto(asset), poster: asset.posterId ? dto(assets.get(asset.posterId)) : null };
  });
};

