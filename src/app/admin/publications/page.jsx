import { headers } from "next/headers";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getPublishing } from "@/server/cms/runtime.mjs";
import Publications from "@/features/cms/publishing/Publications";
const PublicationsPage = async () => {
  const actor = await requireAdmin();
  const initial = await getPublishing().list(await headers());
  return <main id="main-content" tabIndex={-1} className="space-y-6"><div className="space-y-3"><h1>Publikasi terjadwal</h1>
    <p className="text-muted-foreground">Pantau jadwal halaman dan katalog. Owner dapat membatalkan jadwal yang masih menunggu.</p></div>
    <Publications initial={initial} role={actor.role} /></main>;
};
export default PublicationsPage;
