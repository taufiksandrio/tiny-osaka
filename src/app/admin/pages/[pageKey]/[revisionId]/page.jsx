import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { getPageDefinition } from "@/server/pages/templates.mjs";
import { validPageUuid } from "@/server/pages/validation.mjs";
import PageEditor from "@/features/cms/pages/PageEditor";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
const RevisionPage = async ({ params }) => {
  const actor = await requireAdmin(); const { pageKey, revisionId } = await params;
  if (!getPageDefinition(pageKey) || !validPageUuid(revisionId)) notFound();
  let row;
  try { row = await getCmsPages().read(await headers(), revisionId); }
  catch (error) { if (error.code === "NOT_FOUND") notFound(); throw error; }
  if (row.pageKey !== pageKey) notFound();
  return <main className="space-y-6" id="main-content" tabIndex={-1}>
    <Button asChild variant="ghost" size="sm"><Link href={`/admin/pages/${pageKey}`}><ArrowLeft aria-hidden="true" />Daftar revisi {pageKey}</Link></Button>
    <div className="space-y-2"><h1>Editor halaman {pageKey}</h1><p className="text-muted-foreground">Lengkapi konten, metadata SEO, dan teks tombol sesuai template halaman.</p>
      <p className="text-xs text-muted-foreground">ID revisi: <code className="break-all">{row.id}</code></p></div>
    <PageEditor key={revisionId} initial={row} role={actor.role} />
  </main>;
};
export default RevisionPage;
