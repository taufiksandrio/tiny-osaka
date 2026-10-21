import "server-only";
import { getAuthService } from "../auth/runtime.mjs";
import { getAuthConfig } from "../auth/config.mjs";
import { CmsRequestError, cmsJson, readCmsInput, verifyCmsOrigin, cmsFail } from "../cms/request-policy.mjs";
import { ClientError } from "./clients.mjs";
import { getMcp } from "./runtime.mjs";

// Owner-only CMS endpoint for managing MCP clients. Same rules as the other CMS routes: server session, Owner role, Origin/CSRF.
export const mcpClientsRoute = async (request, operation, { status = 200 } = {}) => {
  try {
    const actor = await getAuthService().authenticate(request.headers);
    if (!actor) cmsFail("AUTH_REQUIRED", 401);
    if (actor.role !== "owner") cmsFail("FORBIDDEN", 403);
    let input = null;
    if (["POST", "PATCH", "PUT"].includes(request.method)) input = await readCmsInput(request, getAuthConfig().baseURL);
    else if (request.method !== "GET") verifyCmsOrigin(request, getAuthConfig().baseURL);
    const mcp = getMcp();
    const output = await operation({ clients: mcp.clients, actor, input });
    if (request.method === "POST") await mcp.audit.safe({ userId: actor.subject, clientId: output.client?.clientId, event: "client_created", outcome: "ok" });
    if (request.method === "DELETE") await mcp.audit.safe({ userId: actor.subject, clientId: output.clientId, event: "client_disabled", outcome: "ok" });
    return cmsJson(output, status);
  } catch (error) {
    if (error instanceof CmsRequestError || error instanceof ClientError) return cmsJson({ code: error.code }, error.status);
    return cmsJson({ code: "CMS_UNAVAILABLE" }, 503);
  }
};
