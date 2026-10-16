import Link from "next/link";
import "@/styles/globals.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tiny Osaka CMS", robots: { index: false, follow: false }, referrer: "no-referrer" };
const AdminLayout = ({ children }) => <html lang="id"><body>
  <a className="skip-link" href="#main-content">Langsung ke konten</a>
  <header className="container auth-header"><Link href="/admin">Tiny Osaka CMS</Link><Link href="/id">Website publik</Link></header>
  {children}
</body></html>;
export default AdminLayout;
