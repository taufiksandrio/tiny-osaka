import Link from "next/link";
import { notFound } from "next/navigation";
import { publicCatalog, publicPage } from "@/server/public/data.mjs";
import { pageDefinitions, isPageLocale } from "@/server/pages/templates.mjs";
import { formatPrice, pricingProduct, minimumPrice } from "@/server/public/view-models.mjs";
import { content } from "../content";
import OrderingNotice from "./OrderingNotice";
import ProductChoices from "./ProductChoices";
import PublishedMedia from "./PublishedMedia";
import HomeContent from "./HomeContent";
import Rich from "./PublicRichText";

const labels = {
  id: { home: "Tiny Osaka", about: "Tentang", menu: "Menu", guides: "Panduan", promos: "Promo", location: "Lokasi dan layanan",
    empty: "Konten belum diterbitkan.", emptyMenu: "Menu belum diterbitkan.", from: "Mulai", back: "Kembali ke menu" },
  en: { home: "Tiny Osaka", about: "About", menu: "Menu", guides: "Guides", promos: "Promotions", location: "Location and service",
    empty: "Content has not been published yet.", emptyMenu: "The menu has not been published yet.", from: "From", back: "Back to menu" },
};
const orderingCopy = locale => ({ ...content[locale],
  orderTitle: locale === "id" ? "Pemesanan melalui platform resmi" : "Ordering through official platforms",
  orderBody: locale === "id" ? "Tautan pemesanan akan tersedia setelah diverifikasi." : "Ordering links will be available after verification.",
});
const Media = ({ items = [], locale }) => items.map(media => <PublishedMedia key={media.id} media={media} locale={locale} />);

export const publishedMetadata = async (key, locale, slug) => {
  if (!isPageLocale(locale)) notFound();
  if (slug) {
    const product = (await publicCatalog(locale))?.products.find(row => row.slug === slug);
    if (!product) notFound();
    return { title: `${product.title} | Tiny Osaka`, description: product.description, robots: { index: false, follow: false } };
  }
  const page = await publicPage(key, locale);
  if (key.startsWith("guide-") && !page) notFound();
  return { title: page?.fields.seoTitle || page?.fields.title || `${labels[locale][key] || "Tiny Osaka"} | Tiny Osaka`,
    description: page?.fields.seoDescription || page?.fields.summary || labels[locale].empty, robots: { index: false, follow: false } };
};

const CatalogCards = ({ catalog, locale }) => !catalog || !catalog.products.length ? <p>{labels[locale].emptyMenu}</p> :
  catalog.categories.map(category => <section key={category.id} aria-labelledby={`category-${category.id}`}>
    <h2 id={`category-${category.id}`}>{category.title}</h2><p>{category.description}</p>
    <div className="menu-grid">{catalog.products.filter(product => product.categoryId === category.id).map(product => <article className="prose-panel" key={product.id}>
      <h3><Link href={`/${locale}/menu/${product.slug}`}>{product.title}</Link></h3><p>{product.description}</p>
      <p>{labels[locale].from} {formatPrice(minimumPrice(pricingProduct(catalog, product)), locale)}</p>
      <Media locale={locale} items={catalog.media.filter(media => media.productId === product.id).slice(0, 1)} />
    </article>)}</div>
  </section>);

export const PublishedPage = async ({ pageKey, locale }) => {
  if (!isPageLocale(locale)) notFound();
  const page = await publicPage(pageKey, locale);
  if (pageKey.startsWith("guide-") && !page) notFound();
  const fields = page?.fields;
  const catalog = ["home", "menu"].includes(pageKey) ? await publicCatalog(locale) : null;
  const guides = pageKey === "guides" ? (await Promise.all(Object.keys(pageDefinitions).filter(key => key.startsWith("guide-")).map(key => publicPage(key, locale)))).filter(Boolean) : [];
  if (pageKey === "home" && fields) return <HomeContent fields={fields} locale={locale}
    catalogContent={catalog?.products.length ? <CatalogCards catalog={catalog} locale={locale} /> : undefined}
    mediaContent={<Media items={page?.media} locale={locale} />} orderingContent={<OrderingNotice copy={orderingCopy(locale)} />} />;
  return <main id="main-content" tabIndex={-1}>
    <section className="page-section container published-content">
      {fields?.eyebrow && <p className="eyebrow">{fields.eyebrow}</p>}
      <h1>{fields?.title || labels[locale][pageKey] || "Tiny Osaka"}</h1>
      {fields ? fields.summary && <p>{fields.summary}</p> : <p>{labels[locale].empty}</p>}
      <Rich document={fields?.body} />
      <Media items={page?.media} locale={locale} />
      {["home", "menu"].includes(pageKey) && <CatalogCards catalog={catalog} locale={locale} />}
      {pageKey === "about" && fields && <>{fields.storyHeading && <h2>{fields.storyHeading}</h2>}<Rich document={fields.storyBody} />
        {fields.serviceHeading && <h2>{fields.serviceHeading}</h2>}<Rich document={fields.serviceBody} /></>}
      {pageKey === "location" && fields && <dl className="info-list">{["city", "service", "hours", "coverage"].filter(key => fields[key]?.trim()).map(key =>
        <div key={key}><dt>{({ id: { city: "Kota", service: "Layanan", hours: "Jam", coverage: "Cakupan" },
          en: { city: "City", service: "Service", hours: "Hours", coverage: "Coverage" } })[locale][key]}</dt><dd>{fields[key]}</dd></div>)}</dl>}
      {guides.length > 0 && <ul>{guides.map(guide => <li key={guide.pageKey}><Link href={`/${locale}${pageDefinitions[guide.pageKey].path}`}>{guide.fields.title}</Link></li>)}</ul>}
    </section>
    <OrderingNotice copy={orderingCopy(locale)} />
  </main>;
};

export const PublishedProduct = async ({ locale, slug }) => {
  if (!isPageLocale(locale)) notFound();
  const catalog = await publicCatalog(locale);
  const product = catalog?.products.find(row => row.slug === slug);
  if (!product) notFound();
  const graph = pricingProduct(catalog, product);
  return <main id="main-content" tabIndex={-1}>
    <section className="page-section container published-content">
      <Link className="text-link" href={`/${locale}/menu`}>{labels[locale].back}</Link>
      <h1>{product.title}</h1><p>{product.description}</p>
      <Media locale={locale} items={catalog.media.filter(media => media.productId === product.id)} />
      <ProductChoices product={graph} locale={locale} />
    </section>
    <OrderingNotice copy={orderingCopy(locale)} />
  </main>;
};
