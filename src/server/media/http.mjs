import "server-only";
import { getAuthService } from "../auth/runtime.mjs";
import { getAuthConfig } from "../auth/config.mjs";
import { getCmsMedia } from "../cms/runtime.mjs";
import { CmsRequestError, cmsJson, cmsFail, readCmsInput } from "../cms/request-policy.mjs";
import { MediaError } from "./validation.mjs";
import { adminMediaHeaders, publicMediaHeaders } from "./cache-headers.mjs";

// visibility "public" is used only by the live /media/<id> route (Cache-Control public + ETag);
// everything else, including the admin route, stays private and uncached.
export const fileResponse = ({ asset, bytes, openRange }, request, { visibility = "private" } = {}) => {
  const length = bytes ? bytes.length : Number(asset.byteSize);
  const body = (start, end) => bytes ? bytes.subarray(start, end + 1) : openRange(start, end);
  const headers = visibility === "public" ? publicMediaHeaders(asset) : adminMediaHeaders(asset);
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0, length - Number(match[2])) : NaN;
    const end = match?.[1] && match[2] ? Math.min(length - 1, Number(match[2])) : length - 1;
    if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= length || end < start) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${length}` } });
    }
    return new Response(body(start, end), { status: 206, headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${length}` } });
  }
  return new Response(body(0, length - 1), { headers: { ...headers, "Content-Length": String(length) } });
};
let uploads = 0;
export const mediaRoute = async (request, operation, { upload = false, file = false } = {}) => {
  let acquired = false;
  try {
    if (!await getAuthService().authenticate(request.headers)) cmsFail("AUTH_REQUIRED", 401);
    let input = null;
    if (upload) {
      if (request.headers.get("origin") !== getAuthConfig().baseURL || ![null, "same-origin", "none"].includes(request.headers.get("sec-fetch-site"))) cmsFail("CSRF_REJECTED", 403);
      if (uploads >= 2) cmsFail("UPLOAD_BUSY", 429);
      if (Number(request.headers.get("content-length")) > 100000000) cmsFail("INPUT_TOO_LARGE", 413);
      uploads++; acquired = true;
    } else if (request.method !== "GET") input = await readCmsInput(request, getAuthConfig().baseURL);
    const result = await operation(getCmsMedia(), input);
    return file ? fileResponse(result, request) : cmsJson(result);
  } catch (error) {
    if (error instanceof CmsRequestError) return cmsJson({ code: error.code }, error.status);
    if (error instanceof MediaError) return cmsJson({ code: error.code },
      error.code === "INPUT_TOO_LARGE" ? 413 : error.code === "AUTH_REQUIRED" ? 401 :
        ["REVISION_CONFLICT"].includes(error.code) ? 409 : ["VIDEO_UNAVAILABLE", "STORAGE_UNAVAILABLE", "PERSISTENCE_FAILED"].includes(error.code) ? 503 : 400);
    return cmsJson({ code: "MEDIA_UNAVAILABLE" }, 503);
  } finally { if (acquired) uploads--; }
};
