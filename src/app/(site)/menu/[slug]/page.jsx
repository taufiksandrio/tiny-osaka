import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedProduct, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { content } from "@/features/public-site/content";
import { getPageContent } from "@/features/public-site/page-content";
import { sampleMenu } from "@/features/public-site/fixtures/menu";
import PageIntro from "@/features/public-site/components/PageIntro";
import { SamplePhoto, MenuCardGrid } from "@/features/public-site/components/MenuCard";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

const getSample = (slug) => {
  const item = sampleMenu.find((sample) => sample.slug === slug);
  if (!item) notFound();
  return item;
};

export const generateStaticParams = () => usesPublishedContent() ? [] : sampleMenu.map(({ slug }) => ({ slug }));

export const generateMetadata = async ({ params }) => {
  const { slug } = await params;
  if (usesPublishedContent()) return publishedMetadata("menu", slug);
  const copy = getPageContent();
  const item = getSample(slug);
  return { title: `${content.itemLabel} ${item.number} — ${copy.pages.menu.label} | Tiny Osaka`, description: item.details };
};

const ProductPage = async ({ params }) => {
  const { slug } = await params;
  if (usesPublishedContent()) return <PublishedProduct slug={slug} />;
  const copy = getPageContent();
  const siteCopy = content;
  const item = getSample(slug);
  const title = `${siteCopy.itemLabel} ${item.number}`;
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy}
        intro={{ title, eyebrow: copy.detailEyebrow, description: item.details }}
        parents={[{ label: copy.pages.menu.label, href: "/menu" }]} />
      <section className="site-section container product-detail" aria-labelledby="product-info-title">
        <div className="product-detail-media"><div className="product-detail-photo"><SamplePhoto tag={siteCopy.sample} note={siteCopy.photo} number={item.number} /></div></div>
        <Card className="content-card"><CardContent>
          <p className="notice-box">{copy.detailNote}</p>
          <h2 id="product-info-title">{copy.product.detailsHeading}</h2>
          <dl className="detail-list">
            {copy.product.fields.map((field) => <div key={field} className="detail-row"><dt>{field}</dt><dd>{copy.product.pending}</dd></div>)}
          </dl>
          <p className="content-note">{copy.product.note}</p>
          <Button asChild variant="outline"><Link href="/menu"><ArrowLeft aria-hidden="true" />{copy.backMenu}</Link></Button>
        </CardContent></Card>
      </section>
      <section className="site-section container related-block" aria-labelledby="related-title">
        <h2 className="related-title" id="related-title">{copy.product.related}</h2>
        <p className="related-intro">{copy.product.relatedIntro}</p>
        <MenuCardGrid items={sampleMenu.filter((sample) => sample.slug !== slug)} copy={siteCopy} headingLevel="h3" />
      </section>
      <OrderingNotice copy={siteCopy} />
    </main>
  );
};

export default ProductPage;
