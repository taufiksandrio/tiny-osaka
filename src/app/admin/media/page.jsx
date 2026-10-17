import { headers } from "next/headers";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsMedia } from "@/server/cms/runtime.mjs";
import MediaLibrary from "@/features/cms/media/MediaLibrary";
const MediaPage = async () => {
  await requireAdmin(); const initial = await getCmsMedia().list(await headers());
  return <main id="main-content" tabIndex={-1} className="space-y-6"><div className="space-y-3"><h1>Pustaka media</h1>
    <p className="text-muted-foreground">Unggah dan pilih media untuk draft halaman atau produk. Upload belum menerbitkan media ke website.</p></div><MediaLibrary initial={initial} /></main>;
};
export default MediaPage;
