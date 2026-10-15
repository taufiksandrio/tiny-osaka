import { content } from "@/features/public-site/content";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import PageIntro from "@/features/public-site/components/PageIntro";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async ({ params }) => getPageMetadata((await params).locale, "location");

const LocationPage = async ({ params }) => {
  const { locale } = await params;
  const copy = getPageContent(locale);
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro locale={locale} copy={copy} intro={copy.pages.location} />
      <section className="page-section container editorial-grid" aria-labelledby="location-heading">
        <div className="prose-panel"><h2 id="location-heading">{copy.location.heading}</h2><p>{copy.location.note}</p></div>
        <dl className="info-list location-list">
          {copy.location.entries.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}
        </dl>
      </section>
      <OrderingNotice copy={content[locale]} />
    </main>
  );
};

export default LocationPage;
