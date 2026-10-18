import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import MobileNav from "./MobileNav";

const mobileCopy = { openMenu: "Buka menu", closeMenu: "Tutup menu", menuTitle: "Menu", menuDescription: "Tautan halaman utama Tiny Osaka", mobileNavLabel: "Navigasi seluler" };

const SiteHeader = ({ copy }) => {
  const links = [
    { href: "/menu", label: copy.nav.menu },
    { href: "/about", label: copy.nav.about },
    { href: "/promos", label: copy.nav.promos },
    { href: "/#ordering", label: copy.nav.order },
  ];
  return (
    <header className="site-header" id="top">
      <div className="container header-inner">
        <Link className="wordmark" href="/">
          <Image src="/brand/tiny-osaka-logo.png" alt="" width={64} height={64} unoptimized className="site-brand-mark" />
          <span>TINY<br />OSAKA<span className="brand-dot">.</span></span>
        </Link>
        <nav className="main-nav" aria-label={copy.navLabel}>
          {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
        <div className="header-actions">
          <Button asChild><Link href="/menu">Pesan</Link></Button>
          <MobileNav links={links} copy={mobileCopy} />
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
