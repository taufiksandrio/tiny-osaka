import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { content } from "@/features/public-site/content";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import PageIntro from "@/features/public-site/components/PageIntro";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async () => usesPublishedContent() ? publishedMetadata("about") : getPageMetadata("about");

const AboutPage = async () => {
  if (usesPublishedContent()) return <PublishedPage pageKey="about" />;
  const copy = getPageContent();
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy} intro={copy.pages.about} />
      <section className="site-section container" aria-labelledby="about-heading">
        <Card className="content-card about-card"><CardContent>
          <div className="about-mark" aria-hidden="true"><span lang="ja">大阪</span><span>TINY OSAKA</span></div>
          <div className="site-prose"><h2 id="about-heading">{copy.about.heading}</h2><p>{copy.about.body}</p></div>
        </CardContent></Card>
      </section>
      <section className="site-section container" aria-label="Cerita dan layanan">
        <div className="split-cards">
          <Card className="content-card"><CardContent><div className="site-prose"><h2>{copy.about.storyHeading}</h2><p>{copy.about.storyBody}</p></div></CardContent></Card>
          <Card className="content-card"><CardContent><div className="site-prose"><h2 id="service-heading">{copy.about.serviceHeading}</h2><p>{copy.about.serviceBody}</p></div>
            <Button asChild variant="outline"><Link href="/location">{copy.about.serviceLink}<ArrowRight aria-hidden="true" /></Link></Button></CardContent></Card>
        </div>
      </section>
      <section className="site-section container" aria-label="Menu">
        <Button asChild size="lg"><Link href="/menu">{copy.toMenu}<ArrowRight aria-hidden="true" /></Link></Button>
      </section>
      <OrderingNotice copy={content} />
    </main>
  );
};

export default AboutPage;
