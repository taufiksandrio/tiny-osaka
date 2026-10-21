import { getMcp } from "@/server/mcp/runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const unavailable = () => Response.json({ error: "server_error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
// GET validates the request and sends the Owner to the consent page; POST records the Owner's decision (JSON, CSRF-checked).
export const GET = async request => { try { return await getMcp().oauth.authorizeGet(request); } catch { return unavailable(); } };
export const POST = async request => { try { return await getMcp().oauth.authorizePost(request); } catch { return unavailable(); } };
