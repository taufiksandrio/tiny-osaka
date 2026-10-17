import { mediaRoute } from "@/server/media/http.mjs";
import { exactInput } from "@/server/cms/request-policy.mjs";
export const runtime = "nodejs";
export const GET = request => {
  const query = new URL(request.url).searchParams;
  return mediaRoute(request, api => api.references(request.headers, query.get("domain"), query.get("revisionId"), query.get("productId")));
};
export const POST = request => mediaRoute(request, (api, input) => {
  exactInput(input, ["domain", "action", "data"]);
  return api.reference(request.headers, input.domain, input.action, input.data);
});
