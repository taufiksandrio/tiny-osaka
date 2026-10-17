import { MediaError } from "../media/validation.mjs";
import "server-only";
import { getAuthService } from "../auth/runtime.mjs";
import { getAuthConfig } from "../auth/config.mjs";
import { PageContentError } from "../pages/validation.mjs";
import { CmsRequestError, cmsJson, readCmsInput, cmsFail } from "./request-policy.mjs";
import { getCmsPages } from "./runtime.mjs";

export const cmsRoute = async (request, operation) => {
  try {
    // Authenticate before touching the CMS pool or parsing a mutation.
    if (!await getAuthService().authenticate(request.headers)) cmsFail("AUTH_REQUIRED", 401);
    const input = request.method === "GET" ? null : await readCmsInput(request, getAuthConfig().baseURL);
    return cmsJson(await operation(getCmsPages(), input));
  } catch (error) {
    if (error instanceof MediaError) return cmsJson({ code: error.code }, error.code === "PERSISTENCE_FAILED" ? 503 : 400);
    if (error instanceof CmsRequestError) return cmsJson({ code: error.code }, error.status);
    if (error instanceof PageContentError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "AUTH_REQUIRED" ? 401 :
        ["REVISION_CONFLICT", "HASH_CONFLICT", "LIVE_REVISION", "APPROVAL_REQUIRED"].includes(error.code) ? 409 :
          error.code === "PERSISTENCE_FAILED" ? 503 : 400;
      return cmsJson({ code: error.code }, status);
    }
    return cmsJson({ code: "CMS_UNAVAILABLE" }, 503);
  }
};
