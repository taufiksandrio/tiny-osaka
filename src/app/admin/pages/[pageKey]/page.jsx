import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { getPageDefinition } from "@/server/pages/templates.mjs";
import { CreateDraft } from "@/features/cms/pages/RevisionActions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableCaption } from "@/components/ui/table";
import { ArrowLeft, ArrowRight, FilePenLine } from "lucide-react";
const PageRevisions = async ({ params }) => {
  await requireAdmin(); const { pageKey } = await params;
  if (!getPageDefinition(pageKey)) notFound();
  const { rows, publishedRevisionId } = await getCmsPages().revisions(await headers(), pageKey);
  return <main className="space-y-6" id="main-content" tabIndex={-1}>
    <Button asChild variant="ghost" size="sm"><Link href="/admin/pages"><ArrowLeft aria-hidden="true" />Semua halaman</Link></Button>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1>Revisi halaman {pageKey}</h1>
      <p className="text-muted-foreground">Menampilkan paling banyak 100 revisi terbaru. Konten terbit tetap tersimpan saat Anda mengerjakan draft.</p></div><CreateDraft pageKey={pageKey} /></div>
    {rows.length ? <Card className="overflow-hidden py-0 shadow-none"><CardContent className="px-0"><Table className="admin-table">
      <TableCaption className="px-4 pb-4">Daftar revisi halaman {pageKey}</TableCaption>
      <TableHeader><TableRow><TableHead className="pl-5">Revisi</TableHead><TableHead>Status</TableHead><TableHead>Versi</TableHead><TableHead className="text-right pr-5">Tindakan</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(row => <TableRow key={row.id}><TableCell className="pl-5"><Link className="font-medium hover:text-primary" href={`/admin/pages/${pageKey}/${row.id}`}>Revisi {row.id.slice(0, 8)}</Link>
        {row.id === publishedRevisionId && <p className="mt-1 text-xs text-primary">Sedang tampil di publik</p>}</TableCell>
        <TableCell><Badge variant={row.status === "published" ? "default" : "secondary"}>{row.status}</Badge></TableCell>
        <TableCell>{row.version}</TableCell><TableCell className="pr-5 text-right"><Button asChild variant="ghost" size="sm"><Link href={`/admin/pages/${pageKey}/${row.id}`} aria-label={`Buka revisi ${row.id}`}>Buka<ArrowRight aria-hidden="true" /></Link></Button></TableCell>
      </TableRow>)}</TableBody>
    </Table></CardContent></Card> : <Card className="shadow-none"><CardContent className="flex flex-col items-center gap-3 py-10 text-center">
      <FilePenLine className="size-8 text-muted-foreground" aria-hidden="true" /><h2>Belum ada revisi</h2><p className="text-muted-foreground">Belum ada revisi. Mulai dengan draft baru.</p>
    </CardContent></Card>}
  </main>;
};
export default PageRevisions;
