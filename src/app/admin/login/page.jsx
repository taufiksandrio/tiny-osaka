import LoginForm from "@/features/cms/auth/LoginForm";
import { ShieldCheck, Languages, GitPullRequest } from "lucide-react";
import { Card, CardHeader, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Masuk | Tiny Osaka CMS" };
const LoginPage = () => <main id="main-content" tabIndex={-1} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
  <section className="hidden space-y-7 lg:block" aria-label="Tentang workspace">
    <Badge variant="outline">Tiny Osaka · Internal workspace</Badge>
    <h2 className="max-w-md !text-4xl !leading-tight !font-semibold">Konten yang tertata.<br /><span className="text-primary">Cerita yang konsisten.</span></h2>
    <p className="max-w-md text-base leading-relaxed text-muted-foreground">Satu tempat untuk menyusun, meninjau, dan menerbitkan konten website Tiny Osaka.</p>
    <div className="grid gap-5 pt-3">{[[Languages, "Dua bahasa, satu workspace", "Kelola konten Indonesia dan Inggris berdampingan."], [GitPullRequest, "Setiap revisi ditinjau", "Draft terpisah dari konten yang sudah tampil."], [ShieldCheck, "Akses sesuai peran", "Persetujuan dan publikasi berada di tangan Owner."]].map(([Icon, title, copy]) => <div className="flex items-start gap-4" key={title}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Icon className="size-5" aria-hidden="true" /></span>
      <div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{copy}</p></div></div>)}</div>
  </section>
  <div className="mx-auto w-full max-w-md"><Card className="gap-7 shadow-sm"><CardHeader className="space-y-2">
    <p className="text-xs font-semibold tracking-widest text-primary uppercase">Selamat datang kembali</p>
    <h1>Masuk ke CMS</h1><CardDescription>Hanya untuk akun internal Owner dan Staff.</CardDescription>
  </CardHeader><CardContent><LoginForm /></CardContent></Card>
    <p className="mt-6 text-center text-xs text-muted-foreground">Tiny Osaka · Website content management</p>
  </div>
</main>;
export default LoginPage;
