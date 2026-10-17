import { cmsRoute } from "@/server/cms/http.mjs";
import { cmsFail } from "@/server/cms/request-policy.mjs";
export const dynamic = "force-dynamic";
export const GET = async (request, { params }) => {
  const { revisionId } = await params;
  return cmsRoute(request, api => api.read(request.headers, revisionId));
};
export const PATCH = async (request, { params }) => {
  const { revisionId } = await params;
  return cmsRoute(request, (api, input) => {
    if (input.revisionId !== revisionId) cmsFail("INVALID_INPUT");
    return api.write(request.headers, "save", input);
  });
};
