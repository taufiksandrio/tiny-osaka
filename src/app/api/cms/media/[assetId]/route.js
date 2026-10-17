import { mediaRoute } from "@/server/media/http.mjs";
export const runtime = "nodejs";
export const GET = async (request, { params }) => {
  const { assetId } = await params;
  return mediaRoute(request, api => api.file(request.headers, assetId, true), { file: true });
};
