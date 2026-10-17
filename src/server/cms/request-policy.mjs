export class CmsRequestError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
export const cmsFail = (code, status = 400) => { throw new CmsRequestError(code, status); };
export const cmsJson = (value, status = 200) => Response.json(value, { status,
  headers: { "Cache-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff" } });
// Bodyless mutations (DELETE) use this alone; JSON mutations get it through readCmsInput.
export const verifyCmsOrigin = (request, origin) => {
  if (request.headers.get("origin") !== origin ||
    ![null, "same-origin", "none"].includes(request.headers.get("sec-fetch-site"))) cmsFail("CSRF_REJECTED", 403);
};
export const readCmsInput = async (request, origin) => {
  verifyCmsOrigin(request, origin);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") cmsFail("INVALID_INPUT", 415);
  if (Number(request.headers.get("content-length")) > 80000) cmsFail("INPUT_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) cmsFail("INVALID_INPUT");
  let size = 0, body = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 80000) { await reader.cancel(); cmsFail("INPUT_TOO_LARGE", 413); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const input = JSON.parse(body);
    if (!input || typeof input !== "object" || Array.isArray(input)) cmsFail("INVALID_INPUT");
    return input;
  } catch (error) {
    if (error instanceof CmsRequestError) throw error;
    cmsFail("INVALID_INPUT");
  } finally { reader.releaseLock(); }
};
export const exactInput = (input, fields) => {
  if (!input || Object.keys(input).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(input, key))) cmsFail("INVALID_INPUT");
};
export const getCmsDatabaseConfig = (env = process.env) => {
  const target = env.PUBLIC_DATABASE_TARGET ?? "dev";
  if (!["dev", "test"].includes(target)) cmsFail("CMS_UNAVAILABLE", 503);
  const value = env[target === "test" ? "TEST_CMS_DATABASE_URL" : "CMS_DATABASE_URL"];
  let url;
  try { url = new URL(value); } catch { cmsFail("CMS_UNAVAILABLE", 503); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    (url.port && url.port !== "5432") || url.pathname !== `/tiny_osaka_${target}` ||
    url.username !== `tiny_osaka_${target}_cms` || !url.password || url.password === "REPLACE_LOCALLY" || url.search || url.hash) cmsFail("CMS_UNAVAILABLE", 503);
  return { connectionString: value, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    statement_timeout: 15000, lock_timeout: 5000, application_name: `tiny-osaka-${target}-cms` };
};
