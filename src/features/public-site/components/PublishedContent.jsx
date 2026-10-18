import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { publicCatalog as readCatalog, publicPage } from "@/server/public/data.mjs";
import { pageDefinitions, publicPagePath } from "@/server/pages/templates.mjs";
import { formatPrice, listedProducts, featuredProducts } from "@/server/public/view-models.mjs";
import { content } from "../content";
import OrderingNotice from "./OrderingNotice";
import PublishedMedia from "./PublishedMedia";
import ProductCardImage from "./ProductCardImage";
import { ProductGrid } from "./ProductCard";
import GuideCard, { GuideGrid } from "./GuideCard";
import PageIntro, { Breadcrumbs, PUBLISHED_INTRO_COPY } from "./PageIntro";
import HomeContent from "./HomeContent";
import Rich from "./PublicRichText";

const labels = { home: "Tiny Osaka", about: "Tentang", menu: "Menu", guides: "Panduan", promos: "Promo", location: "Lokasi dan layanan",
    empty: "Konten belum diterbitkan.", emptyMenu: "Menu belum diterbitkan.", back: "Kembali ke menu", backHome: "Kembali ke beranda",
    guidesAll: "Semua panduan", toMenu: "Lihat menu", more: "Menu lainnya", gallery: "Daftar menu", read: "Baca" };
const locationLabels = { city: "Kota", service: "Layanan", hours: "Jam", coverage: "Cakupan" };
const orderingCopy = { ...content,
  orderTitle: "Pemesanan melalui platform resmi",
  orderBody: "Tautan pemesanan akan tersedia setelah diverifikasi.",
};
const publicCatalog = () => readCatalog();
const Media = ({ items = [] }) => items.map(media => <PublishedMedia key={media.id} media={media} />);
const firstImage = (items = []) => items.find(media => media.asset.kind === "image");
const hasBlocks = document => Boolean(document?.blocks?.length);

export const publishedMetadata = async (key, slug) => {
  if (slug) {
    const product = (await publicCatalog())?.products.find(row => row.slug === slug);
    if (!product) notFound();
    return { title: `${product.title} | Tiny Osaka`, description: product.description, robots: { index: false, follow: false } };
  }
  const page = await publicPage(key);
  if (key.startsWith("guide-") && !page) notFound();
  return { title: page?.fields.seoTitle || page?.fields.title || `${labels[key] || "Tiny Osaka"} | Tiny Osaka`,
    description: page?.fields.seoDescription || page?.fields.summary || labels.empty, robots: { index: false, follow: false } };
};

const EmptyCard = ({ children, action }) => <Card className="empty-card"><CardContent>
  <p>{children}</p>{action}</CardContent></Card>;
const Block = ({ label, children, className = "" }) => <section className={`site-section container ${className}`.trim()} aria-label={label}>{children}</section>;
// Rich text + media of a page in one card; renders nothing when both are empty (no empty heading, no filler).
const ProseCard = ({ document, media = [] }) => (hasBlocks(document) || media.length > 0) && <Card className="content-card"><CardContent>
  <Rich document={document} />{media.length > 0 && <div className="content-media"><Media items={media} /></div>}</CardContent></Card>;

const CatalogGrid = ({ catalog, limit, headingLevel = "h2", priorityFirst = false, columns }) => {
  const products = catalog ? (limit ? featuredProducts(catalog, limit) : listedProducts(catalog)) : [];
  if (!products.length) return null;
  return <ProductGrid catalog={catalog} products={products} headingLevel={headingLevel} priorityFirst={priorityFirst} columns={columns} />;
};

const introFor = (pageKey, fields) => ({ eyebrow: fields?.eyebrow, title: fields?.title || labels[pageKey] || "Tiny Osaka",
  label: pageKey.startsWith("guide-") ? undefined : labels[pageKey], description: fields?.summary });

const AboutBody = ({ fields, page }) => {
  const story = fields.storyHeading || hasBlocks(fields.storyBody);
  const service = fields.serviceHeading || hasBlocks(fields.serviceBody);
  return <>
    {(hasBlocks(fields.body) || page.media.length > 0) && <Block label="Cerita Tiny Osaka"><ProseCard document={fields.body} media={page.media} /></Block>}
    {(story || service) && <Block label="Cerita dan layanan"><div className="split-cards">
      {story && <Card className="content-card"><CardContent>{fields.storyHeading && <h2>{fields.storyHeading}</h2>}<Rich document={fields.storyBody} /></CardContent></Card>}
      {service && <Card className="content-card"><CardContent>{fields.serviceHeading && <h2>{fields.serviceHeading}</h2>}<Rich document={fields.serviceBody} />
        <Button asChild variant="outline"><Link href="/location">{labels.location}<ArrowRight aria-hidden="true" /></Link></Button></CardContent></Card>}
    </div></Block>}
    <Block label="Menu"><Button asChild size="lg"><Link href="/menu">{labels.toMenu}<ArrowRight aria-hidden="true" /></Link></Button></Block>
  </>;
};

const LocationBody = ({ fields, page }) => {
  const rows = Object.keys(locationLabels).filter(key => fields[key]?.trim());
  return <Block label="Informasi lokasi"><Card className="content-card"><CardContent>
    <Rich document={fields.body} />
    {rows.length > 0 && <dl className="detail-list">{rows.map((key) => <div key={key} className="detail-row"><dt>{locationLabels[key]}</dt><dd>{fields[key]}</dd></div>)}</dl>}
    {page.media.length > 0 && <div className="content-media"><Media items={page.media} /></div>}
  </CardContent></Card></Block>;
};

const GuidesBody = ({ guides }) => <Block label="Daftar panduan">{guides.length ? <GuideGrid>{guides.map(guide => <li key={guide.pageKey}>
  <GuideCard title={guide.fields.title} summary={guide.fields.summary} href={publicPagePath(pageDefinitions[guide.pageKey])} readLabel={labels.read}
    cover={<ProductCardImage media={firstImage(guide.media)} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" />} />
</li>)}</GuideGrid> : <EmptyCard>{labels.empty}</EmptyCard>}</Block>;

const GuideArticle = ({ fields, page }) => <>
  {page.media.length > 0 && <Block label="Media panduan" className="guide-media"><Media items={page.media} /></Block>}
  {hasBlocks(fields.body) && <Block label="Isi panduan"><Rich document={fields.body} className="site-prose-article" /></Block>}
  <Block label="Tautan lanjutan"><Separator /><div className="article-actions">
    <Button asChild variant="outline"><Link href="/guides"><ArrowLeft aria-hidden="true" />{labels.guidesAll}</Link></Button>
    <Button asChild><Link href="/menu">{labels.toMenu}<ArrowRight aria-hidden="true" /></Link></Button></div></Block>
</>;

const readPage = async key => { const row = await publicPage(key); return row && { ...row, media: row.media ?? [] }; };

export const PublishedPage = async ({ pageKey }) => {
  const page = await readPage(pageKey);
  if (pageKey.startsWith("guide-") && !page) notFound();
  const fields = page?.fields;
  const catalog = ["home", "menu"].includes(pageKey) ? await publicCatalog() : null;
  const guides = pageKey === "guides" ? (await Promise.all(Object.keys(pageDefinitions).filter(key => key.startsWith("guide-")).map(key => readPage(key)))).filter(Boolean) : [];
  if (pageKey === "home" && fields) {
    const hero = firstImage(page.media);
    const rest = (page.media ?? []).filter(media => media !== hero);
    return <HomeContent fields={fields} heroMedia={hero}
      catalogContent={catalog?.products.length ? <CatalogGrid catalog={catalog} limit={6} headingLevel="h3" columns={3} /> : undefined}
      mediaContent={rest.length ? <Media items={rest} /> : undefined} orderingContent={<OrderingNotice copy={orderingCopy} />} />;
  }
  const isGuide = pageKey.startsWith("guide-");
  const parents = isGuide ? [{ label: labels.guides, href: "/guides" }] : [];
  const noData = !fields && !["menu", "guides"].includes(pageKey);
  return <main id="main-content" tabIndex={-1}>
    <PageIntro copy={PUBLISHED_INTRO_COPY} intro={introFor(pageKey, fields)} parents={parents} showPreview={false} />
    {noData && <Block label={labels.empty}><EmptyCard>{labels.empty}</EmptyCard></Block>}
    {fields && pageKey === "about" && <AboutBody fields={fields} page={page} />}
    {fields && pageKey === "location" && <LocationBody fields={fields} page={page} />}
    {fields && (pageKey === "promos" || pageKey === "home") && <Block label="Isi halaman">{hasBlocks(fields.body) || page.media.length
      ? <ProseCard document={fields.body} media={page.media} /> : <EmptyCard>{labels.empty}</EmptyCard>}</Block>}
    {isGuide && fields && <GuideArticle fields={fields} page={page} />}
    {pageKey === "guides" && <GuidesBody guides={guides} />}
    {["home", "menu"].includes(pageKey) && <>
      {pageKey === "menu" && fields && (hasBlocks(fields.body) || page.media.length > 0) && <Block label="Tentang menu"><ProseCard document={fields.body} media={page.media} /></Block>}
      <Block label={labels.gallery}>{catalog?.products.length
        ? <CatalogGrid catalog={catalog} priorityFirst={pageKey === "menu"} />
        : <EmptyCard action={<Button asChild variant="outline"><Link href="/">{labels.backHome}</Link></Button>}>{labels.emptyMenu}</EmptyCard>}</Block>
    </>}
    <OrderingNotice copy={orderingCopy} />
  </main>;
};

export const PublishedProduct = async ({ slug }) => {
  const catalog = await publicCatalog();
  const product = catalog?.products.find(row => row.slug === slug);
  if (!product) notFound();
  const price = listedProducts({ products: [product] })[0].price;
  const media = catalog.media.filter(row => row.productId === product.id);
  const main = firstImage(media);
  const rest = media.filter(row => row !== main);
  const others = listedProducts(catalog).filter(row => row.id !== product.id).slice(0, 3);
  return <main id="main-content" tabIndex={-1}>
    <div className="container detail-crumbs"><Breadcrumbs copy={PUBLISHED_INTRO_COPY} parents={[{ label: labels.menu, href: "/menu" }]} current={product.title} /></div>
    <section className="container product-detail" aria-labelledby="page-title">
      <div className="product-detail-media">
        <div className="product-detail-photo"><ProductCardImage media={main} priority sizes="(max-width: 1023px) 100vw, 50vw" /></div>
        {rest.length > 0 && <div className="product-detail-gallery"><Media items={rest} /></div>}
      </div>
      <div className="product-detail-info">
        <h1 id="page-title">{product.title}</h1>
        <p className="product-detail-price">{formatPrice(price)}</p>
        {product.description && <p className="product-detail-description">{product.description}</p>}
        <Separator />
        <Button asChild variant="outline"><Link href="/menu"><ArrowLeft aria-hidden="true" />{labels.back}</Link></Button>
      </div>
    </section>
    {others.length > 0 && <Block label={labels.more} className="related-block"><h2 className="related-title">{labels.more}</h2>
      <ProductGrid catalog={catalog} products={others} headingLevel="h3" columns={3} orderable={false} /></Block>}
    <OrderingNotice copy={orderingCopy} />
  </main>;
};
