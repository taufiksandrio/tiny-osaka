import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { content } from "@/features/public-site/content";
import { getPageContent } from "@/features/public-site/page-content";
import { sampleGuides } from "@/features/public-site/fixtures/guides";
import PageIntro from "@/features/public-site/components/PageIntro";
import { SamplePhoto } from "@/features/public-site/components/MenuCard";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

const getGuide = (slug) => {
  const guide = sampleGuides.find((sample) => sample.slug === slug);
  if (!guide) notFound();
  return guide;
};

export const generateStaticParams = () => usesPublishedContent() ? [] : sampleGuides.map(({ slug }) => ({ slug }));

export const generateMetadata = async ({ params }) => {
  const { slug } = await params;
  if (usesPublishedContent()) return publishedMetadata("guide-" + slug);
  const copy = getPageContent();
  const guide = getGuide(slug);
  return { title: `${copy.guides.titlePrefix} ${guide.title} — ${copy.preview} | Tiny Osaka`, description: copy.guides.articleNote };
};

const GuidePage = async ({ params }) => {
  const { slug } = await params;
  if (usesPublishedContent()) return <PublishedPage pageKey={"guide-" + slug} />;
  const copy = getPageContent();
  const guide = getGuide(slug);
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy}
        intro={{ title: `${copy.guides.titlePrefix} ${guide.title}`, label: guide.title, eyebrow: copy.guides.status, description: copy.guides.articleNote }}
        parents={[{ label: copy.pages.guides.label, href: "/guides" }]} />
      <article className="site-section container guide-article">
        <div className="guide-media"><div className="guide-sample-photo"><SamplePhoto tag={copy.guides.status} note={copy.guides.image} number={guide.number} /></div></div>
        <div className="site-prose site-prose-article">
          {copy.guides.sections.map((section, index) => (
            <section className="article-section" key={section.title} aria-labelledby={`guide-section-${index}`}>
              <h2 id={`guide-section-${index}`}><span className="article-number" aria-hidden="true">0{index + 1}</span>{section.title}</h2><p>{section.body}</p>
            </section>
          ))}
        </div>
        <Separator />
        <div className="article-actions">
          <Button asChild variant="outline"><Link href="/guides"><ArrowLeft aria-hidden="true" />{copy.backGuides}</Link></Button>
          <Button asChild><Link href="/menu">{copy.toMenu}<ArrowRight aria-hidden="true" /></Link></Button>
        </div>
      </article>
      <OrderingNotice copy={content} />
    </main>
  );
};

export default GuidePage;
