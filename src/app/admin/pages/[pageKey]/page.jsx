import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { getPageDefinition } from "@/server/pages/templates.mjs";
import { CreateDraft } from "@/features/cms/pages/RevisionActions";
import { Card, CardContent } from "@/components/ui/card";
import RevisionStatus from "@/features/cms/pages/RevisionStatus";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableCaption } from "@/components/ui/table";
import { ArrowLeft, ArrowRight, FilePenLine } from "lucide-react";
const createdDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const RevisionDate = ({ value }) => <time dateTime={new Date(value).toISOString()}>{createdDate.format(new Date(value))} WIB</time>;
const PageRevisions = async ({ params }) => {
  await requireAdmin(); const { pageKey } = await params;
  if (!getPageDefinition(pageKey)) notFound();
  const { rows, publishedRevisionId } = await getCmsPages().revisions(await headers(), pageKey);
  return <main className="space-y-6" id="main-content" tabIndex={-1}>
    <Button asChild variant="ghost" size="sm"><Link href="/admin/pages"><ArrowLeft aria-hidden="true" />Semua halaman</Link></Button>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1>Revisi halaman {pageKey}</h1>
      <p className="text-muted-foreground">Menampilkan paling banyak 100 revisi terbaru. Konten terbit tetap tersimpan saat Anda mengerjakan draft.</p></div><CreateDraft pageKey={pageKey} /></div>
    {rows.length ? <>
    <p className="text-sm text-muted-foreground">{rows.length} revisi dalam daftar · {rows.filter(row => row.status === "draft").length} draft</p>
    <div className="grid gap-4 md:hidden" aria-label="Daftar revisi mobile">{rows.map(row => <Card key={row.id} className="gap-0 shadow-none"><CardContent className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2>Revisi {row.id.slice(0, 8)}</h2><RevisionStatus status={row.status} /></div>
      {row.id === publishedRevisionId && <p className="text-sm font-medium text-primary">Sedang tampil di publik</p>}
      <dl className="grid gap-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Versi</dt><dd>{row.version}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Dibuat</dt><dd><RevisionDate value={row.createdAt} /></dd></div></dl>
      <Button asChild variant="outline"><Link href={`/admin/pages/${pageKey}/${row.id}`} aria-label={`Buka revisi ${row.id}`}>Buka revisi<ArrowRight aria-hidden="true" /></Link></Button>
    </CardContent></Card>)}</div>
    <Card className="hidden overflow-hidden py-0 shadow-none md:block"><CardContent className="px-0"><Table className="admin-table">
      <TableCaption className="px-4 pb-4">Daftar revisi halaman {pageKey}</TableCaption>
      <TableHeader><TableRow><TableHead className="pl-5">Revisi</TableHead><TableHead>Status</TableHead><TableHead>Versi</TableHead><TableHead>Dibuat (WIB)</TableHead><TableHead className="text-right pr-5">Tindakan</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(row => <TableRow key={row.id}><TableCell className="pl-5"><Link className="font-medium hover:text-primary" href={`/admin/pages/${pageKey}/${row.id}`}>Revisi {row.id.slice(0, 8)}</Link>
        {row.id === publishedRevisionId && <p className="mt-1 text-xs text-primary">Sedang tampil di publik</p>}</TableCell>
        <TableCell><RevisionStatus status={row.status} /></TableCell>
        <TableCell>{row.version}</TableCell><TableCell><RevisionDate value={row.createdAt} /></TableCell><TableCell className="pr-5 text-right"><Button asChild variant="ghost" size="sm"><Link href={`/admin/pages/${pageKey}/${row.id}`} aria-label={`Buka revisi ${row.id}`}>Buka<ArrowRight aria-hidden="true" /></Link></Button></TableCell>
      </TableRow>)}</TableBody>
    </Table></CardContent></Card></> : <Card className="shadow-none"><CardContent className="flex flex-col items-center gap-3 py-10 text-center">
      <FilePenLine className="size-8 text-muted-foreground" aria-hidden="true" /><h2>Belum ada revisi</h2><p className="text-muted-foreground">Belum ada revisi. Mulai dengan draft baru.</p>
    </CardContent></Card>}
  </main>;
};
export default PageRevisions;
