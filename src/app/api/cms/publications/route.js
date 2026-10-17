import { getAuthService } from "@/server/auth/runtime.mjs";
import { getAuthConfig } from "@/server/auth/config.mjs";
import { getPublishing } from "@/server/cms/runtime.mjs";
import { CmsRequestError, cmsJson, cmsFail, readCmsInput } from "@/server/cms/request-policy.mjs";
import { PublishingError } from "@/server/publishing/policy.mjs";
export const runtime = "nodejs";
const handle = async request => {
  try {
    if (!await getAuthService().authenticate(request.headers)) cmsFail("AUTH_REQUIRED", 401);
    if (request.method === "GET") return cmsJson(await getPublishing().list(request.headers));
    const input = await readCmsInput(request, getAuthConfig().baseURL);
    return cmsJson(await getPublishing().write(request.headers, input));
  } catch (error) {
    if (error instanceof CmsRequestError) return cmsJson({ code: error.code }, error.status);
    if (error instanceof PublishingError) return cmsJson({ code: error.code },
      ["SCHEDULE_EXISTS", "SCHEDULE_CONFLICT", "REVISION_UNAVAILABLE"].includes(error.code) ? 409 : 400);
    return cmsJson({ code: "CMS_UNAVAILABLE" }, 503);
  }
};
export const GET = handle;
export const POST = handle;
