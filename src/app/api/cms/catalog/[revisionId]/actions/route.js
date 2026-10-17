import { catalogRoute } from "@/server/cms/catalog-http.mjs";
import { cmsFail, exactInput } from "@/server/cms/request-policy.mjs";
export const dynamic = "force-dynamic";
export const POST = (request, { params }) => catalogRoute(request, async (api, input) => {
  exactInput(input, ["action", "data"]);
  const id = (await params).revisionId;
  if (!["clone", "readiness", "submit", "approve", "reject", "publish", "archive"].includes(input.action) ||
    (input.action === "clone" ? input.data?.sourceRevisionId : input.data?.revisionId) !== id) cmsFail("INVALID_INPUT");
  return api.write(request.headers, input.action, input.data);
});
