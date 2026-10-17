"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Files, ShieldCheck, ArrowUpRight, UtensilsCrossed, Images } from "lucide-react";
import { cn } from "@/lib/utils";
const AdminNav = ({ role, onNavigate }) => {
  const pathname = usePathname();
  const items = [
    { href: "/admin", title: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/pages", title: "Halaman website", icon: Files },
    { href: "/admin/catalog", title: "Katalog menu", icon: UtensilsCrossed },
    { href: "/admin/media", title: "Pustaka media", icon: Images },
    ...(role === "owner" ? [{ href: "/admin/security", title: "Keamanan", icon: ShieldCheck }] : []),
  ];
  return <nav aria-label="Navigasi CMS" className="grid gap-1">
    <p className="px-3 pb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Workspace</p>
    {items.map(({ href, title, icon: Icon }) => {
      const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
        className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary", active && "bg-accent text-accent-foreground")}>
        <Icon className="size-4" aria-hidden="true" />{title}
      </Link>;
    })}
    <div className="my-4 border-t border-border" />
    <Link href="/" onClick={onNavigate} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
      <ArrowUpRight className="size-4" aria-hidden="true" />Website publik
    </Link>
  </nav>;
};
export default AdminNav;
