"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import AdminHeader from "./AdminHeader";
import AdminNav from "./AdminNav";
const Brand = () => <Link href="/admin" className="flex items-center gap-3">
  <Image src="/brand/tiny-osaka-logo.png" alt="" width={48} height={48} unoptimized className="size-12 shrink-0" />
  <span className="grid"><span className="text-base font-bold tracking-tight">Tiny Osaka</span><span className="text-xs text-muted-foreground">Content workspace</span></span>
</Link>;
const AdminShell = ({ actor, children }) => {
  const pathname = usePathname(), [open, setOpen] = useState(false);
  const navTrigger = useRef(null);
  const authPage = ["/admin/login", "/admin/reset-password", "/admin/verify-email"].includes(pathname);
  if (authPage || !actor) return <div className="min-h-screen">
    <a className="skip-link" href="#main-content">Langsung ke konten</a>
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-5 py-5 sm:px-10">
      <Brand /><Button asChild variant="ghost" size="sm"><Link href="/id">Website publik<ArrowUpRight aria-hidden="true" /></Link></Button>
    </header><div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">{children}</div>
  </div>;
  return <div inert={open} className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
    <a className="skip-link" href="#main-content">Langsung ke konten</a>
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-card p-5 lg:flex">
      <div className="px-2 pt-2 pb-10"><Brand /></div><AdminNav role={actor.role} />
      <div className="mt-auto rounded-xl border border-border bg-background p-4"><Badge variant="outline">Internal CMS</Badge>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Susun konten, tinjau revisi, lalu terbitkan dengan persetujuan Owner.</p></div>
    </aside>
    <div className="min-w-0"><AdminHeader actor={actor} navTriggerRef={navTrigger} onOpenNav={() => setOpen(true)} />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      <footer className="px-4 py-6 text-xs text-muted-foreground sm:px-8">Tiny Osaka · Content management</footer>
    </div>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="left" closeLabel="Tutup navigasi" className="w-[min(85vw,320px)] p-5"
      onCloseAutoFocus={event => { event.preventDefault(); navTrigger.current?.focus(); }}>
      <SheetHeader className="px-0 pb-6"><SheetTitle>Tiny Osaka CMS</SheetTitle><SheetDescription>Navigasi workspace konten</SheetDescription></SheetHeader>
      <AdminNav role={actor.role} onNavigate={() => setOpen(false)} />
    </SheetContent></Sheet>
  </div>;
};
export default AdminShell;
