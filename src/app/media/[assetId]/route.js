import { publicMedia, usesPublishedContent } from "@/server/public/data.mjs";
import { validMediaUuid } from "@/server/media/validation.mjs";
import { createLocalStorage } from "@/server/media/storage.mjs";
import { fileResponse } from "@/server/media/http.mjs";
import { publicNotFound, publicNotModified } from "@/server/media/cache-headers.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = async (request, { params }) => {
  const { assetId } = await params;
  try {
    if (!validMediaUuid(assetId) || !usesPublishedContent()) return publicNotFound();
    // Live check first: a withdrawn asset is 404 at the origin immediately, even for conditional requests.
    const asset = await publicMedia(assetId);
    if (!asset) return publicNotFound();
    // Matching If-None-Match returns 304 without reading or hashing the file.
    return publicNotModified(asset, request) ?? fileResponse({ asset, ...await createLocalStorage().delivery(asset) }, request, { visibility: "public" });
  } catch { return publicNotFound(); }
};
