import { catalogRoute } from "@/server/cms/catalog-http.mjs";
import { revalidatePath } from "next/cache";
import { cmsFail, exactInput } from "@/server/cms/request-policy.mjs";
export const dynamic = "force-dynamic";
export const POST = (request, { params }) => catalogRoute(request, async (api, input) => {
  exactInput(input, ["action", "data"]);
  if (input.data && Object.hasOwn(input.data, "dueAt")) cmsFail("SCHEDULING_REMOVED", 410);
  const id = (await params).revisionId;
  if (!["clone", "readiness", "submit", "approve", "reject", "publish", "archive"].includes(input.action) ||
    (input.action === "clone" ? input.data?.sourceRevisionId : input.data?.revisionId) !== id) cmsFail("INVALID_INPUT");
  const result = await api.write(request.headers, input.action, input.data);
  if (result.revision?.status === "published" && ["approve", "publish"].includes(input.action)) revalidatePath("/id", "layout");
  return result;
});
