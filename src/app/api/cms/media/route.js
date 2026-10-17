import { mediaRoute } from "@/server/media/http.mjs";
export const runtime = "nodejs";
export const GET = request => mediaRoute(request, api => api.list(request.headers, { offset: Number(new URL(request.url).searchParams.get("offset") || 0) }));
export const POST = request => mediaRoute(request, (api, input) => api.youtube(request.headers, input));
