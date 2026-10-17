import { publicMedia, usesPublishedContent } from "@/server/public/data.mjs";
import { validMediaUuid } from "@/server/media/validation.mjs";
import { createLocalStorage } from "@/server/media/storage.mjs";
import { fileResponse } from "@/server/media/http.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = async (request, { params }) => {
  const { assetId } = await params;
  try {
    if (!validMediaUuid(assetId) || !usesPublishedContent()) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const asset = await publicMedia(assetId);
    if (!asset) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return fileResponse({ asset, ...await createLocalStorage().delivery(asset) }, request);
  } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
};
