import { mcpClientsRoute } from "@/server/mcp/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Owner-only: list registered MCP clients and register a new public client (name + redirect URIs).
export const GET = request => mcpClientsRoute(request, ({ clients }) => clients.list().then(list => ({ clients: list })));
export const POST = request => mcpClientsRoute(request, async ({ clients, actor, input }) => ({ client: await clients.create({ createdBy: actor.subject, input }) }), { status: 201 });
