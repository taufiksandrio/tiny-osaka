import { revalidatePath } from "next/cache";
import { catalogRoute } from "@/server/cms/catalog-http.mjs";
export const dynamic = "force-dynamic";
// Public pages are server-rendered; refresh them after every catalog mutation.
const refreshPublicCatalog = () => { revalidatePath("/", "layout"); };
export const GET = request => catalogRoute(request, api => api.list(request.headers));
export const POST = request => catalogRoute(request, async (api, input) => {
  const result = await api.create(request.headers, input);
  refreshPublicCatalog();
  return result;
}, { status: 201 });
