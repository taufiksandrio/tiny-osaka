import { cmsRoute } from "@/server/cms/http.mjs";
export const dynamic = "force-dynamic";
export const GET = request => cmsRoute(request, api => api.list(request.headers));
