import { revalidatePath } from "next/cache";
import { cmsRoute } from "@/server/cms/http.mjs";
import { cmsFail } from "@/server/cms/request-policy.mjs";
export const dynamic = "force-dynamic";
export const GET = async (request, { params }) => {
  const { pageKey } = await params;
  return cmsRoute(request, api => api.current(request.headers, pageKey));
};
export const PUT = async (request, { params }) => {
  const { pageKey } = await params;
  return cmsRoute(request, async (api, input) => {
    if (input.pageKey !== pageKey) cmsFail("INVALID_INPUT");
    const result = await api.saveCurrent(request.headers, input);
    revalidatePath("/", "layout");
    return result;
  });
};
