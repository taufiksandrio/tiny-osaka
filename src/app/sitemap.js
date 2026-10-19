import { isIndexingOpen, isPageLive, getSitemapEntries } from "@/server/public/indexing.mjs";
import { usesPublishedContent, publicPage, publicCatalog } from "@/server/public/data.mjs";
import { pageDefinitions, publicPagePath } from "@/server/pages/templates.mjs";

export const dynamic = "force-dynamic";

// Non-production / flag off / invalid SITE_URL: empty sitemap and no database read.
// Only live pages (public_read_page returns content) and live products (/menu/<slug>) are listed; no lastmod, no hreflang.
const sitemap = async () => {
  if (!isIndexingOpen() || !usesPublishedContent()) return [];
  const paths = [];
  const catalog = await publicCatalog();
  const productCount = catalog?.products?.length ?? 0;
  for (const definition of Object.values(pageDefinitions)) {
    const page = await publicPage(definition.key);
    if (isPageLive(definition.key, { page, productCount })) paths.push(publicPagePath(definition));
  }
  for (const product of catalog?.products ?? []) {
    if (typeof product.slug === "string" && /^[a-z0-9-]+$/.test(product.slug)) paths.push(`/menu/${product.slug}`);
  }
  return getSitemapEntries(paths);
};

export default sitemap;
