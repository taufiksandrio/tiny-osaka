import Link from "next/link";
import { requireAdmin } from "@/server/auth/access.mjs";
import LogoutButton from "@/features/cms/auth/LogoutButton";

const AdminPage = async () => {
  const actor = await requireAdmin();
  return <main className="auth-panel container" id="main-content" tabIndex={-1}>
    <h1>Beranda CMS</h1><p>Selamat datang, {actor.name}.</p><p>Peran: {actor.role === "owner" ? "Owner" : "Staff"}</p>
    <p>Pengelolaan konten belum tersedia.</p>
    {actor.role === "owner" && <p><Link href="/admin/security">Keamanan akun dan MFA</Link></p>}
    {!actor.emailVerified && <p>Email akun belum diverifikasi. Reset email memerlukan verifikasi kepemilikan email dan konfigurasi pengiriman.</p>}
    <LogoutButton />
  </main>;
};
export default AdminPage;
