import { getAuthService } from "@/server/auth/runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = async request => {
  try { return await getAuthService().handle(request); }
  catch { return Response.json({ message: "Layanan login sementara tidak tersedia." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
};
export const GET = handle;
export const POST = handle;
