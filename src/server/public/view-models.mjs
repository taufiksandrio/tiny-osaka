export const formatPrice = amount => new Intl.NumberFormat("id-ID",
  { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);

// ADR-037 card model: one price per product and newest-first order. Categories, variants and
// modifiers are hidden structure kept only until stage 2; public UI must not render them.
export const productPrice = product => {
  const variants = product.variants ?? [];
  const standard = variants.find(row => row.code === "standard");
  if (standard) return standard.basePrice;
  return variants.length ? Math.min(...variants.map(row => row.basePrice)) : 0;
};
// sortOrder is a monotonic creation counter (higher = newer); slug keeps legacy ties stable.
export const newestFirst = products => [...products].sort((a, b) => b.sortOrder - a.sortOrder || a.slug.localeCompare(b.slug));
export const listedProducts = catalog => newestFirst(catalog?.products ?? [])
  .map(product => ({ ...product, price: productPrice(product) }));
export const FEATURED_LIMIT = 4;
export const featuredProducts = (catalog, limit = FEATURED_LIMIT) => listedProducts(catalog).slice(0, limit);
