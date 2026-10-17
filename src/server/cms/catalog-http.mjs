import { MediaError } from "../media/validation.mjs";
import "server-only";
import { getAuthService } from "../auth/runtime.mjs";
import { getAuthConfig } from "../auth/config.mjs";
import { CatalogDraftError } from "../catalog/drafts.mjs";
import { CmsRequestError, cmsJson, readCmsInput, cmsFail } from "./request-policy.mjs";
import { getCmsCatalog } from "./runtime.mjs";
export const catalogRoute = async (request, operation) => {
  try {
    if (!await getAuthService().authenticate(request.headers)) cmsFail("AUTH_REQUIRED", 401);
    const input = request.method === "GET" ? null : await readCmsInput(request, getAuthConfig().baseURL);
    return cmsJson(await operation(getCmsCatalog(), input));
  } catch (error) {
    if (error instanceof MediaError) return cmsJson({ code: error.code }, error.code === "PERSISTENCE_FAILED" ? 503 : 400);
    if (error instanceof CmsRequestError) return cmsJson({ code: error.code }, error.status);
    if (error instanceof CatalogDraftError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "AUTH_REQUIRED" ? 401 :
        ["REVISION_CONFLICT", "HASH_CONFLICT", "LIVE_REVISION", "APPROVAL_REQUIRED"].includes(error.code) ? 409 :
          error.code === "PERSISTENCE_FAILED" ? 503 : 400;
      return cmsJson({ code: error.code }, status);
    }
    return cmsJson({ code: "CMS_UNAVAILABLE" }, 503);
  }
};
