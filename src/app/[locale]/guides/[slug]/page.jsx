import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPageContent } from "@/features/public-site/page-content";
import { sampleGuides } from "@/features/public-site/fixtures/guides";
import PageIntro from "@/features/public-site/components/PageIntro";

const getGuide = (slug) => {
  const guide = sampleGuides.find((sample) => sample.slug === slug);
  if (!guide) notFound();
  return guide;
};

export const generateStaticParams = () => usesPublishedContent() ? [] : sampleGuides.map(({ slug }) => ({ slug }));

export const generateMetadata = async ({ params }) => {
  const { locale, slug } = await params;
  if (usesPublishedContent()) return publishedMetadata("guide-" + slug, locale);
  const copy = getPageContent(locale);
  const guide = getGuide(slug);
  return { title: `${copy.guides.titlePrefix} ${guide.title} — ${copy.preview} | Tiny Osaka`, description: copy.guides.articleNote };
};

const GuidePage = async ({ params }) => {
  const { locale, slug } = await params;
  if (usesPublishedContent()) return <PublishedPage pageKey={"guide-" + slug} locale={locale} />;
  const copy = getPageContent(locale);
  const guide = getGuide(slug);
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro locale={locale} copy={copy}
        intro={{ title: `${copy.guides.titlePrefix} ${guide.title}`, label: guide.title, eyebrow: copy.guides.status, description: copy.guides.articleNote }}
        parents={[{ label: copy.pages.guides.label, href: `/${locale}/guides` }]} />
      <article className="page-section container guide-article">
        <div className={`menu-placeholder guide-placeholder tone-${guide.tone}`}>
          <span className="sample-tag">{copy.guides.status}</span>
          <span className="slot-number" aria-hidden="true">{guide.number}</span>
          <span className="photo-note">{copy.guides.image}</span>
        </div>
        <div className="article-body">
          {copy.guides.sections.map((section, index) => (
            <section className="article-section" key={section.title} aria-labelledby={`guide-section-${index}`}>
              <span className="article-number" aria-hidden="true">0{index + 1}</span>
              <div><h2 id={`guide-section-${index}`}>{section.title}</h2><p>{section.body}</p></div>
            </section>
          ))}
          <div className="article-links">
            <Link className="text-link" href={`/${locale}/guides`}><span aria-hidden="true">←</span>{copy.backGuides}</Link>
            <Link className="text-link" href={`/${locale}/menu`}>{copy.toMenu}<span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </article>
    </main>
  );
};

export default GuidePage;
