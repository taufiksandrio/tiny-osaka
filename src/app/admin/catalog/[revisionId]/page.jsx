import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsCatalog } from "@/server/cms/runtime.mjs";
import CatalogEditor from "@/features/cms/catalog/CatalogEditor";
import { Button } from "@/components/ui/button";
const CatalogRevisionPage = async ({ params }) => {
  const actor = await requireAdmin(), { revisionId } = await params;
  let graph;
  try { graph = await getCmsCatalog().read(await headers(), revisionId); }
  catch (error) { if (["NOT_FOUND", "INVALID_INPUT"].includes(error.code)) notFound(); throw error; }
  return <main id="main-content" tabIndex={-1} className="space-y-6">
    <Button asChild variant="ghost"><Link href="/admin/catalog">Kembali ke katalog</Link></Button>
    <div className="space-y-3"><h1>Editor katalog</h1><p className="break-all text-xs text-muted-foreground">ID revisi: {revisionId}</p></div>
    <CatalogEditor key={revisionId} initial={graph} role={actor.role} />
  </main>;
};
export default CatalogRevisionPage;
