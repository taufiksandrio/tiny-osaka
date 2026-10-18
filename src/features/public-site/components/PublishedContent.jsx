import Link from "next/link";
import { notFound } from "next/navigation";
import { publicCatalog as readCatalog, publicPage } from "@/server/public/data.mjs";
import { pageDefinitions, publicPagePath } from "@/server/pages/templates.mjs";
import { formatPrice, listedProducts, featuredProducts } from "@/server/public/view-models.mjs";
import { content } from "../content";
import OrderingNotice from "./OrderingNotice";
import PublishedMedia from "./PublishedMedia";
import ProductCardImage from "./ProductCardImage";
import HomeContent from "./HomeContent";
import Rich from "./PublicRichText";

const labels = { home: "Tiny Osaka", about: "Tentang", menu: "Menu", guides: "Panduan", promos: "Promo", location: "Lokasi dan layanan",
    empty: "Konten belum diterbitkan.", emptyMenu: "Menu belum diterbitkan.", back: "Kembali ke menu" };
const orderingCopy = { ...content,
  orderTitle: "Pemesanan melalui platform resmi",
  orderBody: "Tautan pemesanan akan tersedia setelah diverifikasi.",
};
const publicCatalog = () => readCatalog();
const Media = ({ items = [] }) => items.map(media => <PublishedMedia key={media.id} media={media} />);

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

const CardMedia = ({ items, priority }) => items.map(media => media.asset.kind === "image" ?
  <ProductCardImage key={media.id} media={media} priority={priority} /> : <PublishedMedia key={media.id} media={media} />);
const CatalogCards = ({ catalog, limit, headingLevel: Heading = "h2", priorityFirst = false }) => {
  const products = catalog ? (limit ? featuredProducts(catalog, limit) : listedProducts(catalog)) : [];
  if (!products.length) return <p>{labels.emptyMenu}</p>;
  return <div className="menu-grid">{products.map((product, index) => <article className="prose-panel" key={product.id}>
    <Heading><Link href={`/menu/${product.slug}`}>{product.title}</Link></Heading>{product.description && <p>{product.description}</p>}
    <p>{formatPrice(product.price)}</p>
    <CardMedia items={catalog.media.filter(media => media.productId === product.id).slice(0, 1)} priority={priorityFirst && index === 0} />
  </article>)}</div>;
};

export const PublishedPage = async ({ pageKey }) => {
  const page = await publicPage(pageKey);
  if (pageKey.startsWith("guide-") && !page) notFound();
  const fields = page?.fields;
  const catalog = ["home", "menu"].includes(pageKey) ? await publicCatalog() : null;
  const guides = pageKey === "guides" ? (await Promise.all(Object.keys(pageDefinitions).filter(key => key.startsWith("guide-")).map(key => publicPage(key)))).filter(Boolean) : [];
  if (pageKey === "home" && fields) return <HomeContent fields={fields}
    catalogContent={catalog?.products.length ? <CatalogCards catalog={catalog} limit={4} headingLevel="h3" /> : undefined}
    mediaContent={<Media items={page?.media} />} orderingContent={<OrderingNotice copy={orderingCopy} />} />;
  return <main id="main-content" tabIndex={-1}>
    <section className="page-section container published-content">
      {fields?.eyebrow && <p className="eyebrow">{fields.eyebrow}</p>}
      <h1>{fields?.title || labels[pageKey] || "Tiny Osaka"}</h1>
      {fields ? fields.summary && <p>{fields.summary}</p> : <p>{labels.empty}</p>}
      <Rich document={fields?.body} />
      <Media items={page?.media} />
      {["home", "menu"].includes(pageKey) && <CatalogCards catalog={catalog} priorityFirst={pageKey === "menu"} />}
      {pageKey === "about" && fields && <>{fields.storyHeading && <h2>{fields.storyHeading}</h2>}<Rich document={fields.storyBody} />
        {fields.serviceHeading && <h2>{fields.serviceHeading}</h2>}<Rich document={fields.serviceBody} /></>}
      {pageKey === "location" && fields && <dl className="info-list">{["city", "service", "hours", "coverage"].filter(key => fields[key]?.trim()).map(key =>
        <div key={key}><dt>{({ city: "Kota", service: "Layanan", hours: "Jam", coverage: "Cakupan" })[key]}</dt><dd>{fields[key]}</dd></div>)}</dl>}
      {guides.length > 0 && <ul>{guides.map(guide => <li key={guide.pageKey}><Link href={publicPagePath(pageDefinitions[guide.pageKey])}>{guide.fields.title}</Link></li>)}</ul>}
    </section>
    <OrderingNotice copy={orderingCopy} />
  </main>;
};

export const PublishedProduct = async ({ slug }) => {
  const catalog = await publicCatalog();
  const product = catalog?.products.find(row => row.slug === slug);
  if (!product) notFound();
  const price = listedProducts({ products: [product] })[0].price;
  return <main id="main-content" tabIndex={-1}>
    <section className="page-section container published-content">
      <Link className="text-link" href="/menu">{labels.back}</Link>
      <div><h1>{product.title}</h1>{product.description && <p>{product.description}</p>}</div>
      <p>{formatPrice(price)}</p>
      <Media items={catalog.media.filter(media => media.productId === product.id)} />
    </section>
    <OrderingNotice copy={orderingCopy} />
  </main>;
};
