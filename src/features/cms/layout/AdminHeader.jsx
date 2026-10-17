"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import LogoutButton from "@/features/cms/auth/LogoutButton";
const AdminHeader = ({ actor, onOpenNav, navTriggerRef }) => {
  const pathname = usePathname();
  const section = pathname.startsWith("/admin/media") ? "Pustaka media" : pathname.startsWith("/admin/catalog") ? "Katalog menu" : pathname.startsWith("/admin/pages") ? "Halaman website" : pathname.startsWith("/admin/security") ? "Keamanan" : "Dashboard";
  return <header className="sticky top-0 z-30 flex min-h-18 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-8">
    <div className="flex min-w-0 items-center gap-3">
      <Button ref={navTriggerRef} variant="outline" size="icon" className="lg:hidden" aria-label="Buka navigasi" onClick={onOpenNav}><Menu aria-hidden="true" /></Button>
      <Breadcrumb><BreadcrumbList>
        <BreadcrumbItem className="hidden sm:block"><BreadcrumbLink asChild><Link href="/admin">CMS</Link></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:block" />
        <BreadcrumbItem><BreadcrumbPage>{section}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList></Breadcrumb>
    </div>
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      <DropdownMenu modal={false}><DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={`Menu akun ${actor.name}`} className="gap-2 px-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary"><UserRound className="size-4" aria-hidden="true" /></span>
          <span className="hidden max-w-36 truncate sm:block">{actor.name}</span>
        </Button>
      </DropdownMenuTrigger><DropdownMenuContent align="end" portalLabel="Menu akun" className="w-56">
        <DropdownMenuLabel className="break-words whitespace-normal">{actor.name}</DropdownMenuLabel>
        <DropdownMenuLabel><Badge variant="secondary">{actor.role === "owner" ? "Owner" : "Staff"}</Badge></DropdownMenuLabel>
        <DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/id">Lihat website</Link></DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu><LogoutButton />
    </div>
  </header>;
};
export default AdminHeader;
