import Link from "next/link";
import Image from "next/image";

const SiteHeader = ({ copy }) => (
  <header className="site-header" id="top">
    <div className="container header-inner">
      <Link className="wordmark" href="/">
        <Image src="/brand/tiny-osaka-logo.png" alt="" width={64} height={64} unoptimized className="site-brand-mark" />
        <span>TINY<br />OSAKA<span className="brand-dot">.</span></span>
      </Link>
      <nav className="main-nav" aria-label={copy.navLabel}>
        <Link href="/menu">{copy.nav.menu}</Link>
        <Link href="/about">{copy.nav.about}</Link>
        <Link href="/promos">{copy.nav.promos}</Link>
        <Link href="/#ordering">{copy.nav.order}</Link>
      </nav>

    </div>
  </header>
);

export default SiteHeader;
