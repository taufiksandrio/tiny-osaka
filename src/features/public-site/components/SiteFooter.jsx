import Link from "next/link";
import Image from "next/image";
import PrivacySettingsButton from "./PrivacySettingsButton";

const SiteFooter = ({ copy, analyticsEnabled = false }) => (
  <footer className="site-footer">
    <div className="container footer-inner">
      <div>
        <Link className="footer-brand footer-brand-lockup" href="/"><Image src="/brand/tiny-osaka-logo.png" alt="" width={56} height={56} unoptimized />TINY OSAKA.</Link>
        <p>{copy.footerNote}</p>
        <p className="footer-preview">{copy.footerPreview}</p>
      </div>
      <nav className="footer-nav" aria-label={copy.footerNavLabel}>
        <Link href="/guides">{copy.nav.guides}</Link>
        <Link href="/promos">{copy.nav.promos}</Link>
        <Link href="/location">{copy.nav.location}</Link>
        <Link href="/privasi">Kebijakan privasi</Link>
        {analyticsEnabled && <PrivacySettingsButton />}
      </nav>
      <a className="back-top" href="#top">{copy.backTop} <span aria-hidden="true">↑</span></a>
    </div>
  </footer>
);

export default SiteFooter;
