import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import { content } from "@/features/public-site/content";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import { sampleGuides } from "@/features/public-site/fixtures/guides";
import PageIntro from "@/features/public-site/components/PageIntro";
import GuideCard, { GuideGrid } from "@/features/public-site/components/GuideCard";
import { SamplePhoto } from "@/features/public-site/components/MenuCard";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async () => usesPublishedContent() ? publishedMetadata("guides") : getPageMetadata("guides");

const GuidesPage = async () => {
  if (usesPublishedContent()) return <PublishedPage pageKey="guides" />;
  const copy = getPageContent();
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy} intro={copy.pages.guides} />
      <section className="site-section container" aria-labelledby="guides-heading">
        <h2 className="sr-only" id="guides-heading">{copy.guides.heading}</h2>
        <GuideGrid>
          {sampleGuides.map((guide) => <li key={guide.slug}>
            <GuideCard title={guide.title} summary={copy.guides.summary} href={`/guides/${guide.slug}`} readLabel={copy.guides.read}
              cover={<SamplePhoto tag={copy.guides.status} note={copy.guides.image} number={guide.number} />} />
          </li>)}
        </GuideGrid>
      </section>
      <OrderingNotice copy={content} />
    </main>
  );
};

export default GuidesPage;
