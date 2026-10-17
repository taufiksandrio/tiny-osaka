import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
const PagesPage = async () => {
  await requireAdmin();
  const pages = await getCmsPages().list(await headers());
  return <main className="auth-panel container" id="main-content" tabIndex={-1}>
    <Link href="/admin">Beranda CMS</Link><h1>Halaman website</h1>
    <ul>{pages.map(page => <li key={page.key}><Link href={`/admin/pages/${page.key}`}>{page.key}</Link>
      <p>{page.publishedRevisionId ? "Memiliki revisi terbit" : "Belum diterbitkan"}</p></li>)}</ul>
  </main>;
};
export default PagesPage;
