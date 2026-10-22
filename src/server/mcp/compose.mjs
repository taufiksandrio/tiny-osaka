import "server-only";
import { createTokenStore } from "./tokens.mjs";
import { createClients } from "./clients.mjs";
import { createAudit } from "./audit.mjs";
import { createLimits } from "./limits.mjs";
import { createBearerAuth } from "./auth.mjs";
import { createOAuth } from "./oauth.mjs";
import { createUploads } from "./uploads.mjs";
import { createImportUrl } from "./import-url.mjs";
import { createMcpHandler } from "./server.mjs";

// Wires the MCP module to the authentication service (app-role pool, HMAC counters) and the CMS services (isolated role).
// The MCP tables are reachable only through the auth pool; the CMS pool has no grant on them.
export const buildMcp = ({ pool, consume, baseURL, authenticateSession, cmsFor, refreshPublic, now, importOptions }) => {
  const tokens = createTokenStore({ pool, now });
  const clients = createClients({ pool });
  const audit = createAudit({ pool });
  const limits = createLimits({ consume, audit });
  const bearer = createBearerAuth({ pool, baseURL, tokens, now });
  const oauth = createOAuth({ pool, baseURL, clients, tokens, audit, limits, authenticateSession, now });
  const uploads = createUploads({ pool, baseURL, limits, audit, cmsFor, authenticateSession, now });
  const imports = createImportUrl(importOptions);
  const server = createMcpHandler({ baseURL, bearer, limits, audit, cmsFor, uploads, imports, refreshPublic });
  return Object.freeze({ tokens, clients, audit, limits, bearer, oauth, uploads, imports, server });
};

