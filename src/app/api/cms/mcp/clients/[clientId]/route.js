import { mcpClientsRoute } from "@/server/mcp/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Owner-only: disable a client and revoke every token it holds immediately.
export const DELETE = async (request, { params }) => {
  const { clientId } = await params;
  return mcpClientsRoute(request, ({ clients }) => clients.disable(clientId));
};
