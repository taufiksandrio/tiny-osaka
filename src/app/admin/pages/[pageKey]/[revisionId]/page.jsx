import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { getPageDefinition } from "@/server/pages/templates.mjs";
import { validPageUuid } from "@/server/pages/validation.mjs";
import PageEditor from "@/features/cms/pages/PageEditor";
const RevisionPage = async ({ params }) => {
  const actor = await requireAdmin(); const { pageKey, revisionId } = await params;
  if (!getPageDefinition(pageKey) || !validPageUuid(revisionId)) notFound();
  let row;
  try { row = await getCmsPages().read(await headers(), revisionId); }
  catch (error) { if (error.code === "NOT_FOUND") notFound(); throw error; }
  if (row.pageKey !== pageKey) notFound();
  return <main className="auth-panel container" id="main-content" tabIndex={-1}>
    <Link href={`/admin/pages/${pageKey}`}>Daftar revisi {pageKey}</Link><h1>Editor halaman {pageKey}</h1>
    <PageEditor key={revisionId} initial={row} role={actor.role} />
  </main>;
};
export default RevisionPage;
