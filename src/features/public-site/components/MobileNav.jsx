"use client";
import { useState } from "react";
import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

// Menu seluler (<768 px). Tautan sama dengan navigasi utama; Radix menangani fokus, Esc, dan latar inert.
const MobileNav = ({ links, copy }) => {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="header-menu-button" aria-label={copy.openMenu}>
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="site-root" closeLabel={copy.closeMenu}>
        <SheetHeader>
          <SheetTitle>{copy.menuTitle}</SheetTitle>
          <SheetDescription className="sr-only">{copy.menuDescription}</SheetDescription>
        </SheetHeader>
        <nav className="mobile-nav" aria-label={copy.mobileNavLabel}>
          {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
        </nav>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNav;
