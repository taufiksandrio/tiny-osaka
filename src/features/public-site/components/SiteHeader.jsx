import Link from "next/link";
import Image from "next/image";
import LanguageSwitcher from "./LanguageSwitcher";

const SiteHeader = ({ locale, copy }) => (
  <header className="site-header" id="top">
    <div className="container header-inner">
      <Link className="wordmark" href={`/${locale}`}>
        <Image src="/brand/tiny-osaka-mark.svg" alt="" width={48} height={48} className="site-brand-mark" />
        <span>TINY<br />OSAKA<span className="brand-dot">.</span></span>
      </Link>
      <nav className="main-nav" aria-label={copy.navLabel}>
        <Link href={`/${locale}/menu`}>{copy.nav.menu}</Link>
        <Link href={`/${locale}/about`}>{copy.nav.about}</Link>
        <Link href={`/${locale}/promos`}>{copy.nav.promos}</Link>
        <a href={`/${locale}#ordering`}>{copy.nav.order}</a>
      </nav>
      <LanguageSwitcher locale={locale} label={copy.languageLabel} />
    </div>
  </header>
);

export default SiteHeader;
