import Link from "next/link";
import { notFound } from "next/navigation";
import { content } from "@/features/public-site/content";
import { getPageContent } from "@/features/public-site/page-content";
import { sampleMenu } from "@/features/public-site/fixtures/menu";
import PageIntro from "@/features/public-site/components/PageIntro";
import MenuCard from "@/features/public-site/components/MenuCard";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

const getSample = (slug) => {
  const item = sampleMenu.find((sample) => sample.slug === slug);
  if (!item) notFound();
  return item;
};

export const generateStaticParams = () => sampleMenu.map(({ slug }) => ({ slug }));

export const generateMetadata = async ({ params }) => {
  const { locale, slug } = await params;
  const copy = getPageContent(locale);
  const item = getSample(slug);
  return { title: `${content[locale].itemLabel} ${item.number} — ${copy.pages.menu.label} | Tiny Osaka`, description: item.details[locale] };
};

const ProductPage = async ({ params }) => {
  const { locale, slug } = await params;
  const copy = getPageContent(locale);
  const siteCopy = content[locale];
  const item = getSample(slug);
  const title = `${siteCopy.itemLabel} ${item.number}`;
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro locale={locale} copy={copy}
        intro={{ title, eyebrow: copy.detailEyebrow, description: item.details[locale] }}
        parents={[{ label: copy.pages.menu.label, href: `/${locale}/menu` }]} />
      <section className="page-section container detail-grid" aria-labelledby="product-info-title">
        <div className={`menu-placeholder detail-placeholder tone-${item.tone}`}>
          <span className="sample-tag">{siteCopy.sample}</span>
          <span className="slot-number" aria-hidden="true">{item.number}</span>
          <span className="photo-note">{siteCopy.photo}</span>
        </div>
        <div className="prose-panel">
          <p className="notice-box">{copy.detailNote}</p>
          <h2 id="product-info-title">{copy.product.detailsHeading}</h2>
          <dl className="info-list">
            {copy.product.fields.map((field) => <div key={field}><dt>{field}</dt><dd>{copy.product.pending}</dd></div>)}
          </dl>
          <p className="content-note">{copy.product.note}</p>
          <Link className="text-link" href={`/${locale}/menu`}><span aria-hidden="true">←</span>{copy.backMenu}</Link>
        </div>
      </section>
      <section className="related-section" aria-labelledby="related-title">
        <div className="container">
          <div className="section-heading"><h2 id="related-title">{copy.product.related}</h2><p>{copy.product.relatedIntro}</p></div>
          <div className="menu-grid related-grid">
            {sampleMenu.filter((sample) => sample.slug !== slug).map((sample) => <MenuCard key={sample.id} item={sample} locale={locale} copy={siteCopy} />)}
          </div>
        </div>
      </section>
      <OrderingNotice copy={siteCopy} />
    </main>
  );
};

export default ProductPage;
