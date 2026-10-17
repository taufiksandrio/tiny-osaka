import "server-only";
import { getAuthService } from "../auth/runtime.mjs";
import { getAuthConfig } from "../auth/config.mjs";
import { CatalogDraftError } from "../catalog/drafts.mjs";
import { CmsRequestError, cmsJson, readCmsInput, verifyCmsOrigin, cmsFail } from "./request-policy.mjs";
import { getCmsCatalog } from "./runtime.mjs";

const conflictCodes = ["REVISION_CONFLICT", "HASH_CONFLICT", "LIVE_REVISION", "APPROVAL_REQUIRED", "SLUG_CONFLICT"];
// GET and DELETE carry no JSON body; every non-GET request still passes the Origin/CSRF check.
export const catalogRoute = async (request, operation, { status = 200 } = {}) => {
  try {
    // Authenticate before touching the CMS pool or parsing a mutation.
    if (!await getAuthService().authenticate(request.headers)) cmsFail("AUTH_REQUIRED", 401);
    let input = null;
    if (["POST", "PATCH", "PUT"].includes(request.method)) input = await readCmsInput(request, getAuthConfig().baseURL);
    else if (request.method !== "GET") verifyCmsOrigin(request, getAuthConfig().baseURL);
    return cmsJson(await operation(getCmsCatalog(), input), status);
  } catch (error) {
    if (error instanceof CmsRequestError) return cmsJson({ code: error.code }, error.status);
    if (error instanceof CatalogDraftError) {
      const code = error.code;
      const http = code === "FORBIDDEN" ? 403 : code === "AUTH_REQUIRED" ? 401 : conflictCodes.includes(code) ? 409 :
        code === "PERSISTENCE_FAILED" ? 503 : 400;
      return cmsJson({ code }, http);
    }
    return cmsJson({ code: "CMS_UNAVAILABLE" }, 503);
  }
};
