import { headers } from "next/headers";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsCatalog } from "@/server/cms/runtime.mjs";
import CatalogBoard from "@/features/cms/catalog/CatalogBoard";
const CatalogPage = async () => {
  await requireAdmin();
  const initial = await getCmsCatalog().list(await headers());
  return <main id="main-content" tabIndex={-1}><CatalogBoard initial={initial} /></main>;
};
export default CatalogPage;
