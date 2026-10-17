import { cmsRoute } from "@/server/cms/http.mjs";
import { cmsFail } from "@/server/cms/request-policy.mjs";
export const POST = async (request, { params }) => {
  const { revisionId } = await params;
  return cmsRoute(request, (api, input) => {
    const { action, ...payload } = input;
    if ((action === "clone" ? payload.sourceRevisionId : payload.revisionId) !== revisionId ||
      !["clone", "submit", "approve", "reject", "publish", "archive"].includes(action)) cmsFail("INVALID_INPUT");
    return api.write(request.headers, action, payload);
  });
};
