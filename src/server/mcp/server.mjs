import "server-only";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { wwwAuthenticate } from "./auth.mjs";
import { newRequestId } from "./audit.mjs";
import { hasScope } from "./tokens.mjs";
import { limitedResponse } from "./limits.mjs";
import { tools, listTools, parseToolInput, describeFailure, imagesOf } from "./tools.mjs";
import { createThumbnails } from "./thumbnails.mjs";

// Stateless Streamable HTTP endpoint (POST only; JSON responses). GET/DELETE answer 405 because no sessions or server-initiated
// streams exist. Order: Origin -> method -> Bearer + current Owner membership -> rate limit -> body -> tool.
const MAX_BODY = 80000;
const CALL_TIMEOUT_MS = 20000;
const BASE_HEADERS = Object.freeze({ "Cache-Control": "no-store", "Pragma": "no-cache", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" });
const json = (body, status, headers = {}) => Response.json(body, { status, headers: { ...BASE_HEADERS, ...headers } });
const rpcError = (status, code, message, headers) => json({ jsonrpc: "2.0", error: { code, message }, id: null }, status, headers);

const readJsonBody = async request => {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") return { status: 415 };
  if (Number(request.headers.get("content-length")) > MAX_BODY) return { status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400 };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return { status: 413 }; }
      text += decoder.decode(value, { stream: true });
    }
    return { body: JSON.parse(text + decoder.decode()) };
  } catch { return { status: 400 }; } finally { reader.releaseLock(); }
};
const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { timeout: true })), ms); })]).finally(() => clearTimeout(timer));
};
const result = (value, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(value) },
  ...imagesOf(value).map(({ data, mimeType }) => ({ type: "image", data, mimeType }))], ...(isError ? { isError: true } : {}) });

export const createMcpHandler = ({ baseURL, bearer, limits, audit, cmsFor, uploads, imports, thumbnails = createThumbnails(), refreshPublic = () => {} }) => {
  const callTool = async (actor, params, requestId) => {
    const name = params?.name;
    const base = { userId: actor.subject, clientId: actor.clientId, event: "tool_call", tool: typeof name === "string" ? name : "unknown", requestId };
    if (typeof name !== "string" || !Object.hasOwn(tools, name)) {
      await audit.safe({ ...base, tool: "unknown", outcome: "error", code: "UNKNOWN_TOOL" });
      return result({ code: "UNKNOWN_TOOL", status: 404 }, true);
    }
    const definition = tools[name];
    if (!hasScope(actor.scope, definition.scope)) {
      await audit.safe({ ...base, outcome: "denied", code: "INSUFFICIENT_SCOPE" });
      return result({ code: "INSUFFICIENT_SCOPE", status: 403, scope: definition.scope }, true);
    }
    let input;
    try {
      input = parseToolInput(name, params.arguments);
      const output = await withTimeout(definition.run(cmsFor(actor), new Headers(), input, { actor, uploads, imports, thumbnails }), CALL_TIMEOUT_MS);
      if (definition.refresh) { try { refreshPublic(); } catch { console.error("Public cache refresh failed."); } }
      await audit.safe({ ...base, target: definition.target(input, output), outcome: "ok" });
      return result(output);
    } catch (error) {
      const failure = error?.timeout ? { code: "TIMEOUT", status: 504 } : describeFailure(error);
      await audit.safe({ ...base, target: input ? definition.target(input, null) : null, outcome: failure.status >= 500 ? "error" : "denied", code: failure.code });
      return result(failure, true);
    }
  };
  const buildServer = (actor, requestId) => {
    const server = new Server({ name: "tiny-osaka", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => callTool(actor, params, requestId));
    return server;
  };

  const handle = async request => {
    const requestId = newRequestId();
    try {
      const origin = request.headers.get("origin");
      if (origin !== null && origin !== baseURL) return json({ error: "forbidden_origin" }, 403, { "X-Request-Id": requestId });
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST", "X-Request-Id": requestId });
      const auth = await bearer.authenticate(request);
      if (!auth.ok) {
        if (auth.error) {
          const anonymous = await limits.hit("call", "unauthenticated");
          if (!anonymous.allowed) return limitedResponse(anonymous.retryAfter);
          await audit.safe({ event: "request_denied", tool: "mcp", outcome: "denied", code: auth.status === 401 ? "invalid_token" : "forbidden", requestId });
        }
        return json({ error: auth.status === 401 ? "invalid_token" : "forbidden" }, auth.status, { "WWW-Authenticate": wwwAuthenticate(baseURL, auth.error), "X-Request-Id": requestId });
      }
      const { actor } = auth;
      const limited = await limits.hit("call", "user:" + actor.subject, { userId: actor.subject, clientId: actor.clientId });
      if (!limited.allowed) return limitedResponse(limited.retryAfter);
      const parsed = await readJsonBody(request);
      if (parsed.status) return rpcError(parsed.status, -32600, "Permintaan tidak valid.", { "X-Request-Id": requestId });
      if (Array.isArray(parsed.body) || !parsed.body || typeof parsed.body !== "object") return rpcError(400, -32600, "Batch tidak didukung.", { "X-Request-Id": requestId });
      if (parsed.body.method === "tools/call" && typeof parsed.body.params?.name === "string" && Object.hasOwn(tools, parsed.body.params.name) && tools[parsed.body.params.name].write) {
        const writes = await limits.hit("write", "user:" + actor.subject, { userId: actor.subject, clientId: actor.clientId });
        if (!writes.allowed) return limitedResponse(writes.retryAfter);
      }
      if (parsed.body.method === "tools/call" && ["media_upload_request", "media_import_url"].includes(parsed.body.params?.name)) {
        // AC-30: upload requests are limited per Owner (429 + Retry-After), on top of the general write limit.
        const uploadsLimit = await limits.hit("upload", "user:" + actor.subject, { userId: actor.subject, clientId: actor.clientId });
        if (!uploadsLimit.allowed) return limitedResponse(uploadsLimit.retryAfter);
      }
      const server = buildServer(actor, requestId);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      const response = await transport.handleRequest(request, { parsedBody: parsed.body });
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries({ ...BASE_HEADERS, "X-Request-Id": requestId })) headers.set(key, value);
      const buffered = await response.arrayBuffer();
      await server.close().catch(() => {});
      return new Response(buffered.byteLength ? buffered : null, { status: response.status, headers });
    } catch {
      return json({ error: "server_error" }, 503, { "X-Request-Id": requestId });
    }
  };
  return Object.freeze({ handle });
};
