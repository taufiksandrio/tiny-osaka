import { getMcp } from "@/server/mcp/runtime.mjs";
import { UPLOAD_HEADERS } from "@/server/mcp/uploads.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Single-use photo upload (agent URL and the Owner page form). No cookie is needed on the agent path; the token is the credential.
export const POST = async (request, { params }) => {
  const { token } = await params;
  try { return await getMcp().uploads.handle(request, token); }
  catch { return Response.json({ code: "UPLOAD_FAILED" }, { status: 503, headers: UPLOAD_HEADERS }); }
};
