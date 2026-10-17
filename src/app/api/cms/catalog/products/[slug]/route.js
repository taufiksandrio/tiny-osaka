import { revalidatePath } from "next/cache";
import { catalogRoute } from "@/server/cms/catalog-http.mjs";
export const dynamic = "force-dynamic";
const refresh = () => { revalidatePath("/", "layout"); };
export const PATCH = async (request, { params }) => {
  const { slug } = await params;
  return catalogRoute(request, async (api, input) => {
    const result = await api.update(request.headers, slug, input);
    refresh();
    return result;
  });
};
// Owner-only hard delete. No body; the Origin check still applies.
export const DELETE = async (request, { params }) => {
  const { slug } = await params;
  return catalogRoute(request, async api => {
    const result = await api.remove(request.headers, slug);
    refresh();
    return result;
  });
};
