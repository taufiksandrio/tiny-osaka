import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Files, ArrowRight, Globe } from "lucide-react";
const PagesPage = async () => {
  await requireAdmin();
  const pages = await getCmsPages().list(await headers());
  return <main className="space-y-7" id="main-content" tabIndex={-1}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1>Halaman website</h1>
      <p className="text-muted-foreground">Pilih halaman untuk menyusun konten dan mengelola revisi Indonesia / Inggris.</p></div>
      <Badge variant="outline"><Files className="size-3" aria-hidden="true" />{pages.length} template</Badge>
    </div>
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pages.map(page => <li key={page.key} className="min-w-0">
      <Card className="h-full gap-4 shadow-none"><CardHeader><div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-secondary"><Files className="size-5 text-muted-foreground" aria-hidden="true" /></span>
        <Badge variant={page.publishedRevisionId ? "default" : "secondary"}>{page.publishedRevisionId ? "Terbit" : "Belum terbit"}</Badge>
      </div><h2><Link href={`/admin/pages/${page.key}`} className="hover:text-primary">{page.key}</Link></h2>
        <CardDescription>{page.publishedRevisionId ? "Memiliki revisi terbit" : "Belum diterbitkan"}</CardDescription>
      </CardHeader><CardContent className="space-y-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Globe className="size-3.5" aria-hidden="true" />Indonesia & English</p>
        <Button asChild variant="outline" className="w-full justify-between"><Link href={`/admin/pages/${page.key}`} aria-label={`Kelola revisi ${page.key}`}>Kelola revisi<ArrowRight aria-hidden="true" /></Link></Button>
      </CardContent></Card>
    </li>)}</ul>
  </main>;
};
export default PagesPage;
