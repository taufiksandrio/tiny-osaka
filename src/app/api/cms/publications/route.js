import { getAuthService } from "@/server/auth/runtime.mjs";
import { CmsRequestError, cmsJson, cmsFail } from "@/server/cms/request-policy.mjs";
export const runtime = "nodejs";
const handle = async request => {
  try {
    if (!await getAuthService().authenticate(request.headers)) cmsFail("AUTH_REQUIRED", 401);
    return cmsJson({ code: "SCHEDULING_REMOVED" }, 410);
  } catch (error) {
    if (error instanceof CmsRequestError) return cmsJson({ code: error.code }, error.status);
    return cmsJson({ code: "CMS_UNAVAILABLE" }, 503);
  }
};
export const GET = handle;
export const POST = handle;
