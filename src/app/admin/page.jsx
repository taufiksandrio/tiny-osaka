import Link from "next/link";
import { headers } from "next/headers";
import { Files, CheckCircle2, FilePenLine, ArrowRight, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/server/auth/access.mjs";
import { getCmsPages } from "@/server/cms/runtime.mjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const AdminPage = async () => {
  const actor = await requireAdmin();
  let pages = null;
  try { pages = await getCmsPages().list(await headers()); } catch { /* Do not invent dashboard counts when CMS is unavailable. */ }
  const published = pages?.filter(page => page.publishedRevisionId).length;
  const stats = [
    { title: "Template halaman", value: pages?.length, icon: Files, copy: "Template tetap untuk website bahasa Indonesia" },
    { title: "Halaman tersimpan", value: published, icon: CheckCircle2, copy: "Konten sudah tampil di website" },
    { title: "Belum diisi", value: pages ? pages.length - published : null, icon: FilePenLine, copy: "Buka editor untuk mengisi halaman" },
  ];
  return <main id="main-content" tabIndex={-1} className="space-y-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2">
      <p className="text-xs font-semibold tracking-widest text-primary uppercase">Workspace</p><h1>Beranda CMS</h1>
      <p className="text-muted-foreground">Selamat datang, {actor.name}. Kelola konten Tiny Osaka dari sini.</p>
    </div><Badge variant="secondary">Peran: {actor.role === "owner" ? "Owner" : "Staff"}</Badge></div>
    <div className="grid gap-4 sm:grid-cols-3">{stats.map(({ title, value, icon: Icon, copy }) => <Card key={title} className="gap-4 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3"><CardDescription>{title}</CardDescription><Icon className="size-4 text-muted-foreground" aria-hidden="true" /></CardHeader>
      <CardContent><p className="text-3xl font-semibold tracking-tight">{value ?? "—"}</p><p className="mt-2 text-xs text-muted-foreground">{copy}</p></CardContent>
    </Card>)}</div>
    {!pages && <Alert><AlertTitle>Ringkasan belum tersedia</AlertTitle><AlertDescription>Data halaman belum dapat dimuat. Coba buka pengelolaan halaman kembali.</AlertDescription></Alert>}
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
      <Card className="shadow-none"><CardHeader><CardTitle>Kelola konten</CardTitle><CardDescription>Halaman mengikuti template tetap dalam bahasa Indonesia.</CardDescription></CardHeader>
        <CardContent className="space-y-5"><div className="rounded-xl bg-accent p-5"><Files className="mb-3 size-6 text-primary" aria-hidden="true" />
          <h2>Halaman website</h2><p className="mt-2 text-sm text-muted-foreground">Pilih halaman, ubah kontennya, lalu simpan untuk langsung memperbarui website.</p></div>
          <div className="cms-button-row"><Button asChild><Link href="/admin/pages">Kelola halaman website<ArrowRight aria-hidden="true" /></Link></Button>
          <Button asChild variant="outline"><Link href="/admin/catalog">Kelola katalog menu<ArrowRight aria-hidden="true" /></Link></Button></div>
        </CardContent></Card>
      <Card className="shadow-none"><CardHeader><CardTitle>Cara mengubah halaman</CardTitle><CardDescription>Owner dan karyawan dapat langsung menyimpan perubahan halaman.</CardDescription></CardHeader>
        <CardContent><ol className="grid gap-5">{[["01", "Pilih halaman", "Buka editor dari tabel halaman."], ["02", "Ubah konten", "Lengkapi judul, isi dan foto yang diperlukan."], ["03", "Simpan", "Perubahan langsung tampil di website."]].map(([number, title, copy]) => <li key={number} className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold">{number}</span>
          <div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{copy}</p></div></li>)}</ol></CardContent>
      </Card>
    </div>
    {actor.role === "owner" && <Card className="shadow-none"><CardContent className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><ShieldCheck className="size-5 text-primary" aria-hidden="true" /><div><p className="font-medium">Keamanan akun</p><p className="text-sm text-muted-foreground">Kelola MFA opsional untuk akun Owner.</p></div></div>
      <Button asChild variant="outline"><Link href="/admin/account">Keamanan akun dan MFA</Link></Button>
    </CardContent></Card>}
    {!actor.emailVerified && <Alert><AlertTitle>Email belum diverifikasi</AlertTitle><AlertDescription>Email akun belum diverifikasi. Reset email memerlukan verifikasi kepemilikan email dan konfigurasi pengiriman.</AlertDescription></Alert>}
  </main>;
};
export default AdminPage;
