import { getMcp } from "@/server/mcp/runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = async request => {
  try { return await getMcp().oauth.revoke(request); }
  catch { return Response.json({ error: "server_error" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
};
