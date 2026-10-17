import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import Link from "next/link";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import { sampleGuides } from "@/features/public-site/fixtures/guides";
import PageIntro from "@/features/public-site/components/PageIntro";

export const generateMetadata = async () => usesPublishedContent() ? publishedMetadata("guides") : getPageMetadata("guides");

const GuidesPage = async () => {
  if (usesPublishedContent()) return <PublishedPage pageKey="guides" />;
  const copy = getPageContent();
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy} intro={copy.pages.guides} />
      <section className="page-section container" aria-labelledby="guides-heading">
        <h2 className="section-title" id="guides-heading">{copy.guides.heading}</h2>
        <div className="menu-grid">
          {sampleGuides.map((guide) => (
            <article className="menu-card" key={guide.slug}>
              <div className={`menu-placeholder tone-${guide.tone}`}>
                <span className="sample-tag">{copy.guides.status}</span>
                <span className="slot-number" aria-hidden="true">{guide.number}</span>
                <span className="photo-note">{copy.guides.image}</span>
              </div>
              <div className="menu-card-copy"><h3>{guide.title}</h3><p>{copy.guides.summary}</p>
                <Link className="text-link card-link" href={`/guides/${guide.slug}`}>{copy.guides.read}<span aria-hidden="true">→</span><span className="sr-only"> — {guide.title}</span></Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};

export default GuidesPage;
