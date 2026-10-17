import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import Link from "next/link";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import PageIntro from "@/features/public-site/components/PageIntro";

export const generateMetadata = async () => usesPublishedContent() ? publishedMetadata("promos") : getPageMetadata("promos");

const PromosPage = async () => {
  if (usesPublishedContent()) return <PublishedPage pageKey="promos" />;
  const copy = getPageContent();
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy} intro={copy.pages.promos} />
      <section className="page-section container editorial-grid" aria-labelledby="promos-heading">
        <div className="empty-state prose-panel">
          <span className="empty-mark" aria-hidden="true">✳</span>
          <h2 id="promos-heading">{copy.promos.heading}</h2><p>{copy.promos.body}</p>
          <Link className="text-link" href="/menu">{copy.toMenu}<span aria-hidden="true">→</span></Link>
        </div>
        <div className="prose-panel pending-panel">
          <h2>{copy.promos.infoHeading}</h2>
          <ul className="pending-list">{copy.promos.fields.map((field) => <li key={field}>{field}</li>)}</ul>
          <p className="content-note">{copy.promos.note}</p>
        </div>
      </section>
    </main>
  );
};

export default PromosPage;
