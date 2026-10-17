import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsCatalog } from "@/server/cms/runtime.mjs";
import { CreateCatalogDraft } from "@/features/cms/catalog/CatalogActions";
import RevisionStatus from "@/features/cms/pages/RevisionStatus";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const CatalogPage = async () => {
  await requireAdmin(); const { rows, publishedRevisionId } = await getCmsCatalog().list(await headers());
  return <main id="main-content" tabIndex={-1} className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-6"><div className="space-y-3"><h1>Katalog menu</h1><p className="text-muted-foreground">Kelola kategori, produk, varian, dan modifier dalam revisi bilingual. Menampilkan paling banyak 100 revisi terbaru.</p></div><CreateCatalogDraft /></div>
    {!rows.length && <Card className="shadow-none"><CardContent className="py-8"><h2>Belum ada revisi katalog</h2><p className="mt-3 text-muted-foreground">Mulai dengan draft baru, lalu lengkapi kategori dan produk.</p></CardContent></Card>}
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{rows.map(row => <Card key={row.id} className="min-w-0 shadow-none"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><h2>Revisi {row.id.slice(0, 8)}</h2><RevisionStatus status={row.status} /></div><CardDescription>Versi {row.version}</CardDescription></CardHeader>
      <CardContent className="grid gap-6">{row.id === publishedRevisionId && <p className="font-medium text-primary">Sedang tampil di publik</p>}
        <p className="text-sm text-muted-foreground">Dibuat <time dateTime={new Date(row.createdAt).toISOString()}>{date.format(new Date(row.createdAt))} WIB</time></p>
        <Button asChild variant="outline"><Link href={`/admin/catalog/${row.id}`} aria-label={`Buka katalog ${row.id}`}>Kelola revisi katalog</Link></Button>
      </CardContent></Card>)}</div>
  </main>;
};
export default CatalogPage;
