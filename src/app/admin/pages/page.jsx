import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { pageNames } from "@/server/pages/templates.mjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableCaption } from "@/components/ui/table";
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const PagesPage = async () => {
  await requireAdmin();
  const pages = await getCmsPages().list(await headers());
  return <main id="main-content" tabIndex={-1} className="space-y-6">
    <div className="space-y-2"><h1>Halaman website</h1><p className="text-muted-foreground">Pilih halaman, ubah isinya, lalu simpan untuk langsung memperbarui website.</p></div>
    <Card className="overflow-hidden py-0 shadow-none"><CardContent className="px-0"><Table>
      <TableCaption className="px-4 pb-4">Owner dan karyawan dapat mengedit halaman.</TableCaption>
      <TableHeader><TableRow><TableHead className="pl-4">Nama halaman</TableHead><TableHead>Terakhir diubah (WIB)</TableHead><TableHead className="pr-4 text-right">Tindakan</TableHead></TableRow></TableHeader>
      <TableBody>{pages.map(page => <TableRow key={page.key}>
        <TableCell className="pl-4 font-medium">{pageNames[page.key]}</TableCell>
        <TableCell>{page.updatedAt ? <time dateTime={new Date(page.updatedAt).toISOString()}>{date.format(new Date(page.updatedAt))}</time> : "Belum disimpan"}</TableCell>
        <TableCell className="pr-4 text-right"><Button asChild variant="outline" size="sm"><Link href={`/admin/pages/${page.key}`} aria-label={`Edit halaman ${pageNames[page.key]}`}>Edit</Link></Button></TableCell>
      </TableRow>)}</TableBody>
    </Table></CardContent></Card>
  </main>;
};
export default PagesPage;
