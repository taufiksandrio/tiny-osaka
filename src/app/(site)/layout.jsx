import { usesPublishedContent } from "@/server/public/data.mjs";
import { content } from "@/features/public-site/content";
import SiteHeader from "@/features/public-site/components/SiteHeader";
import SiteFooter from "@/features/public-site/components/SiteFooter";
import "@/styles/globals.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: usesPublishedContent() ? "Tiny Osaka" : content.metadata.title,
  description: usesPublishedContent() ? "Tiny Osaka" : content.metadata.description,
  robots: { index: false, follow: false },
};

const SiteLayout = ({ children }) => {
  const copy = usesPublishedContent() ? { ...content, footerNote: "Tiny Osaka", footerPreview: "Informasi dari konten terbit." } : content;

  return (
    <html lang="id">
      <body>
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
