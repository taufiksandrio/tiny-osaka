import { headers } from "next/headers";
import { ROBOTS_NOINDEX } from "@/server/public/indexing.mjs";
import { getAuthService } from "@/server/auth/runtime.mjs";
import AdminShell from "@/features/cms/layout/AdminShell";
import "@/styles/globals.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tiny Osaka CMS", robots: ROBOTS_NOINDEX, referrer: "no-referrer" };
const AdminLayout = async ({ children }) => {
  let actor = null;
  try { actor = await getAuthService().authenticate(await headers()); } catch { /* Protected routes enforce authentication themselves. */ }
  return <html lang="id"><body className="admin-root">
    <AdminShell actor={actor ? { name: actor.name, role: actor.role } : null}>{children}</AdminShell>
  </body></html>;
};
export default AdminLayout;
