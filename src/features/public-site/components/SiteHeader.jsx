import Link from "next/link";
import Image from "next/image";

const SiteHeader = ({ locale, copy }) => (
  <header className="site-header" id="top">
    <div className="container header-inner">
      <Link className="wordmark" href={`/${locale}`}>
        <Image src="/brand/tiny-osaka-logo.png" alt="" width={64} height={64} unoptimized className="site-brand-mark" />
        <span>TINY<br />OSAKA<span className="brand-dot">.</span></span>
      </Link>
      <nav className="main-nav" aria-label={copy.navLabel}>
        <Link href={`/${locale}/menu`}>{copy.nav.menu}</Link>
        <Link href={`/${locale}/about`}>{copy.nav.about}</Link>
        <Link href={`/${locale}/promos`}>{copy.nav.promos}</Link>
        <a href={`/${locale}#ordering`}>{copy.nav.order}</a>
      </nav>

    </div>
  </header>
);

export default SiteHeader;
