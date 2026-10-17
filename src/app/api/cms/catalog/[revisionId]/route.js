import { catalogRoute } from "@/server/cms/catalog-http.mjs";
import { cmsFail, exactInput } from "@/server/cms/request-policy.mjs";
export const dynamic = "force-dynamic";
export const GET = (request, { params }) => catalogRoute(request, async api => api.read(request.headers, (await params).revisionId));
export const PATCH = (request, { params }) => catalogRoute(request, async (api, input) => {
  exactInput(input, ["action", "data"]);
  if (input.data?.revisionId !== (await params).revisionId) cmsFail("INVALID_INPUT");
  return api.write(request.headers, input.action, input.data);
});
