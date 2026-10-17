import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { getPageDefinition, pageNames } from "@/server/pages/templates.mjs";
import PageEditor from "@/features/cms/pages/PageEditor";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
const EditPage = async ({ params }) => {
  await requireAdmin();
  const { pageKey } = await params;
  if (!getPageDefinition(pageKey)) notFound();
  const initial = await getCmsPages().current(await headers(), pageKey);
  return <main id="main-content" tabIndex={-1} className="space-y-6">
    <Button asChild variant="ghost" size="sm"><Link href="/admin/pages"><ArrowLeft aria-hidden="true" />Semua halaman</Link></Button>
    <div className="space-y-2"><h1>Edit halaman {pageNames[pageKey]}</h1><p className="text-muted-foreground">Perubahan yang disimpan langsung tampil di website.</p></div>
    <PageEditor key={pageKey} initial={initial} />
  </main>;
};
export default EditPage;
