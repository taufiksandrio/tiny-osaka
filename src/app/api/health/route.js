// Railway healthcheck: liveness only. No database access, no environment details, never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export const GET = () => Response.json({ status: "ok" }, { headers });
export const HEAD = () => new Response(null, { status: 200, headers });
