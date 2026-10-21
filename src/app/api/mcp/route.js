import { getMcp } from "@/server/mcp/runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const unavailable = () => Response.json({ error: "server_error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
// Streamable HTTP, stateless: POST carries JSON-RPC; GET/DELETE are answered 405 by the handler.
const handle = async request => {
  try { return await getMcp().server.handle(request); } catch { return unavailable(); }
};
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
