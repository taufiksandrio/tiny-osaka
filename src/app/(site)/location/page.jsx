import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import { content } from "@/features/public-site/content";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import PageIntro from "@/features/public-site/components/PageIntro";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async () => usesPublishedContent() ? publishedMetadata("location") : getPageMetadata("location");

const LocationPage = async () => {
  if (usesPublishedContent()) return <PublishedPage pageKey="location" />;
  const copy = getPageContent();
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy} intro={copy.pages.location} />
      <section className="page-section container editorial-grid" aria-labelledby="location-heading">
        <div className="prose-panel"><h2 id="location-heading">{copy.location.heading}</h2><p>{copy.location.note}</p></div>
        <dl className="info-list location-list">
          {copy.location.entries.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}
        </dl>
      </section>
      <OrderingNotice copy={content} />
    </main>
  );
};

export default LocationPage;
