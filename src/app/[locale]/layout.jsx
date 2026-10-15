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
    title: content[locale].metadata.title,
    description: content[locale].metadata.description,
    robots: { index: false, follow: false },
  };
};

const LocaleLayout = async ({ children, params }) => {
  const { locale } = await params;
  if (!Object.hasOwn(content, locale)) notFound();
  const copy = content[locale];

  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main-content">{copy.skip}</a>
        <div className="preview-banner">{copy.preview}</div>
        <SiteHeader locale={locale} copy={copy} />
        {children}
        <SiteFooter locale={locale} copy={copy} />
      </body>
    </html>
  );
};

export default LocaleLayout;
