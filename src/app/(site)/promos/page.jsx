import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { content } from "@/features/public-site/content";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import PageIntro from "@/features/public-site/components/PageIntro";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async () => usesPublishedContent() ? publishedMetadata("promos") : getPageMetadata("promos");

const PromosPage = async () => {
  if (usesPublishedContent()) return <PublishedPage pageKey="promos" />;
  const copy = getPageContent();
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy} intro={copy.pages.promos} />
      <section className="site-section container" aria-labelledby="promos-heading">
        <Card className="content-card"><CardContent>
          <div className="site-prose"><h2 id="promos-heading">{copy.promos.heading}</h2><p>{copy.promos.body}</p></div>
          <Separator />
          <div className="site-prose"><h2>{copy.promos.infoHeading}</h2>
            <ul>{copy.promos.fields.map((field) => <li key={field}>{field}</li>)}</ul>
            <p className="content-note">{copy.promos.note}</p></div>
          <Button asChild variant="outline"><Link href="/menu">{copy.toMenu}<ArrowRight aria-hidden="true" /></Link></Button>
        </CardContent></Card>
      </section>
      <OrderingNotice copy={content} />
    </main>
  );
};

export default PromosPage;
