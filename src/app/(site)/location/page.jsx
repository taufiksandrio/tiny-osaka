import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import { Card, CardContent } from "@/components/ui/card";
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
      <section className="site-section container" aria-labelledby="location-heading">
        <Card className="content-card"><CardContent>
          <div className="site-prose"><h2 id="location-heading">{copy.location.heading}</h2><p>{copy.location.note}</p></div>
          <dl className="detail-list">
            {copy.location.entries.map((entry) => <div key={entry.label} className="detail-row"><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}
          </dl>
        </CardContent></Card>
      </section>
      <OrderingNotice copy={content} />
    </main>
  );
};

export default LocationPage;
