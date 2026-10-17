import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { getPageDefinition } from "@/server/pages/templates.mjs";
import { CreateDraft } from "@/features/cms/pages/RevisionActions";
const PageRevisions = async ({ params }) => {
  await requireAdmin(); const { pageKey } = await params;
  if (!getPageDefinition(pageKey)) notFound();
  const { rows, publishedRevisionId } = await getCmsPages().revisions(await headers(), pageKey);
  return <main className="auth-panel container" id="main-content" tabIndex={-1}>
    <Link href="/admin/pages">Semua halaman</Link><h1>Revisi halaman {pageKey}</h1><CreateDraft pageKey={pageKey} />
    <p>Menampilkan paling banyak 100 revisi terbaru.</p>
    <ul>{rows.map(row => <li key={row.id}><Link href={`/admin/pages/${pageKey}/${row.id}`}>Revisi {row.id}</Link>
      <p>{row.status} · Versi {row.version}{row.id === publishedRevisionId ? " · Sedang tampil di publik" : ""}</p></li>)}</ul>
    {!rows.length && <p>Belum ada revisi. Mulai dengan draft baru.</p>}
  </main>;
};
export default PageRevisions;
