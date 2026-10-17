import { mediaRoute } from "@/server/media/http.mjs";
export const runtime = "nodejs";
export const POST = request => mediaRoute(request, api => api.upload(request.headers, request.body,
  request.headers.get("content-type")?.split(";", 1)[0] || "", new URL(request.url).searchParams.get("posterId")), { upload: true });
