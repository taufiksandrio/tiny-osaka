import Link from "next/link";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import PageIntro from "@/features/public-site/components/PageIntro";

export const generateMetadata = async ({ params }) => getPageMetadata((await params).locale, "about");

const AboutPage = async ({ params }) => {
  const { locale } = await params;
  const copy = getPageContent(locale);
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro locale={locale} copy={copy} intro={copy.pages.about} />
      <section className="page-section container editorial-grid" aria-labelledby="about-heading">
        <div className="about-mark" aria-hidden="true"><span lang="ja">大阪</span><span>TINY OSAKA</span></div>
        <div className="prose-panel"><h2 id="about-heading">{copy.about.heading}</h2><p>{copy.about.body}</p>
          <h3>{copy.about.storyHeading}</h3><p>{copy.about.storyBody}</p>
          <Link className="text-link" href={`/${locale}/menu`}>{copy.toMenu}<span aria-hidden="true">→</span></Link>
        </div>
      </section>
      <section className="related-section" aria-labelledby="service-heading">
        <div className="container service-strip">
          <h2 id="service-heading">{copy.about.serviceHeading}</h2>
          <div><p>{copy.about.serviceBody}</p><Link className="text-link" href={`/${locale}/location`}>{copy.about.serviceLink}<span aria-hidden="true">→</span></Link></div>
        </div>
      </section>
    </main>
  );
};

export default AboutPage;
