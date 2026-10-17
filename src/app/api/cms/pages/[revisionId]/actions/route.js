import { cmsRoute } from "@/server/cms/http.mjs";
import { revalidatePath } from "next/cache";
import { cmsFail } from "@/server/cms/request-policy.mjs";
export const POST = async (request, { params }) => {
  const { revisionId } = await params;
  return cmsRoute(request, async (api, input) => {
    const { action, ...payload } = input;
    if ((action === "clone" ? payload.sourceRevisionId : payload.revisionId) !== revisionId ||
      !["clone", "submit", "approve", "reject", "publish", "archive"].includes(action)) cmsFail("INVALID_INPUT");
    const result = await api.write(request.headers, action, payload);
    if (result.status === "published" && ["approve", "publish"].includes(action)) revalidatePath("/id", "layout");
    return result;
  });
};
