import { usesPublishedContent } from "@/server/public/data.mjs";
export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { content } from "@/features/public-site/content";
import SiteHeader from "@/features/public-site/components/SiteHeader";
import SiteFooter from "@/features/public-site/components/SiteFooter";
import "@/styles/globals.css";

export const generateStaticParams = () => [{ locale: "id" }, { locale: "en" }];

export const generateMetadata = async ({ params }) => {
  const { locale } = await params;
  if (!Object.hasOwn(content, locale)) notFound();
  return {
    title: usesPublishedContent() ? "Tiny Osaka" : content[locale].metadata.title,
    description: usesPublishedContent() ? "Tiny Osaka" : content[locale].metadata.description,
    robots: { index: false, follow: false },
  };
};

const LocaleLayout = async ({ children, params }) => {
  const { locale } = await params;
  if (!Object.hasOwn(content, locale)) notFound();
  const copy = usesPublishedContent() ? { ...content[locale], footerNote: "Tiny Osaka", footerPreview: locale === "id" ? "Informasi dari konten terbit." : "Information from published content." } : content[locale];

  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main-content">{copy.skip}</a>
        {!usesPublishedContent() && <div className="preview-banner">{copy.preview}</div>}
        <SiteHeader locale={locale} copy={copy} />
        {children}
        <SiteFooter locale={locale} copy={copy} />
      </body>
    </html>
  );
};

export default LocaleLayout;
