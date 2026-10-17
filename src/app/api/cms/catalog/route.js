import { catalogRoute } from "@/server/cms/catalog-http.mjs";
export const dynamic = "force-dynamic";
export const GET = request => catalogRoute(request, api => api.list(request.headers));
export const POST = request => catalogRoute(request, (api, input) => api.write(request.headers, "create", input));
