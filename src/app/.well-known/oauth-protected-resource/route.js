import { getAuthConfig } from "@/server/auth/config.mjs";
import { buildProtectedResourceMetadata, metadataResponse } from "@/server/mcp/oauth.mjs";

export const dynamic = "force-dynamic";
export const GET = () => {
  try { return metadataResponse(buildProtectedResourceMetadata(getAuthConfig().baseURL)); }
  catch { return Response.json({ error: "server_error" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
};
