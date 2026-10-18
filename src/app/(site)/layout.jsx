import { usesPublishedContent } from "@/server/public/data.mjs";
import { content } from "@/features/public-site/content";
import SiteHeader from "@/features/public-site/components/SiteHeader";
import SiteFooter from "@/features/public-site/components/SiteFooter";
import { Plus_Jakarta_Sans } from "next/font/google";
import "@/styles/globals.css";

const siteFont = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-site", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata = {
  title: usesPublishedContent() ? "Tiny Osaka" : content.metadata.title,
  description: usesPublishedContent() ? "Tiny Osaka" : content.metadata.description,
  robots: { index: false, follow: false },
};

const SiteLayout = ({ children }) => {
  const copy = usesPublishedContent() ? { ...content, footerNote: "Tiny Osaka", footerPreview: "Informasi dari konten terbit." } : content;

  return (
    <html lang="id" className={siteFont.variable}>
      <body className="site-root">
        <a className="skip-link" href="#main-content">{copy.skip}</a>
        {!usesPublishedContent() && <div className="preview-banner">{copy.preview}</div>}
        <SiteHeader copy={copy} />
        {children}
        <SiteFooter copy={copy} />
      </body>
    </html>
  );
};

export default SiteLayout;
