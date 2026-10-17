import Link from "next/link";
import Image from "next/image";

const SiteFooter = ({ locale, copy }) => (
  <footer className="site-footer">
    <div className="container footer-inner">
      <div>
        <Link className="footer-brand footer-brand-lockup" href={`/${locale}`}><Image src="/brand/tiny-osaka-logo.png" alt="" width={56} height={56} unoptimized />TINY OSAKA.</Link>
        <p>{copy.footerNote}</p>
        <p className="footer-preview">{copy.footerPreview}</p>
      </div>
      <nav className="footer-nav" aria-label={copy.footerNavLabel}>
        <Link href={`/${locale}/guides`}>{copy.nav.guides}</Link>
        <Link href={`/${locale}/promos`}>{copy.nav.promos}</Link>
        <Link href={`/${locale}/location`}>{copy.nav.location}</Link>
      </nav>
      <a className="back-top" href="#top">{copy.backTop} <span aria-hidden="true">↑</span></a>
    </div>
  </footer>
);

export default SiteFooter;
