import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getPageDefinition } from "@/server/pages/templates.mjs";
const OldRevisionPage = async ({ params }) => {
  await requireAdmin();
  const { pageKey } = await params;
  if (!getPageDefinition(pageKey)) notFound();
  redirect(`/admin/pages/${pageKey}`);
};
export default OldRevisionPage;
