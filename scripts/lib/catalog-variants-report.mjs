// Read-only report for ADR-037 stage 2 decisions. Nothing here writes: every statement is a
// SELECT, the session is READ ONLY, and non-local hosts are refused before connecting.
export class ReportGuardError extends Error {}

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const variableOrder = ["CATALOG_REPORT_DATABASE_URL", "CMS_DATABASE_URL", "DATABASE_URL"];

export const resolveReportUrl = (env = process.env) => {
  const name = variableOrder.find(key => env[key]);
  if (!name) throw new ReportGuardError("Set DATABASE_URL (local dev) in the server environment.");
  let url;
  try { url = new URL(env[name]); } catch { throw new ReportGuardError("Database URL is invalid."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !localHosts.has(url.hostname)) {
    throw new ReportGuardError("Refusing to run: the database host is not local.");
  }
  return env[name];
};

export const reportQueries = Object.freeze({
  revisions: `SELECT r.id, r.status, r.version, r.created_at, (p.revision_id IS NOT NULL) AS live
    FROM public.catalog_revisions r LEFT JOIN public.catalog_publication p ON p.revision_id = r.id AND p.id = 1
    WHERE p.revision_id IS NOT NULL OR r.id = (SELECT id FROM public.catalog_revisions WHERE status = 'draft' ORDER BY created_at DESC, id DESC LIMIT 1)
    ORDER BY live DESC, r.created_at DESC`,
  products: `SELECT e.product_id, p.slug, t.title, c.slug AS category_slug FROM public.product_entries e
    JOIN public.products p ON p.id = e.product_id JOIN public.category_entries ce ON ce.revision_id = e.revision_id AND ce.category_id = e.category_id
    JOIN public.categories c ON c.id = ce.category_id
    LEFT JOIN public.product_translations t ON t.revision_id = e.revision_id AND t.product_id = e.product_id
    WHERE e.revision_id = $1::uuid ORDER BY p.slug`,
  variants: `SELECT product_id, code, base_price FROM public.product_variants WHERE revision_id = $1::uuid ORDER BY product_id, sort_order, code`,
  groups: `SELECT g.product_id, g.code AS group_code, count(o.id)::int AS options, coalesce(max(o.price_delta), 0)::text AS max_price_delta,
    coalesce(sum(o.price_delta), 0)::text AS total_price_delta
    FROM public.modifier_groups g LEFT JOIN public.modifier_options o ON o.revision_id = g.revision_id AND o.product_id = g.product_id AND o.group_id = g.id
    WHERE g.revision_id = $1::uuid GROUP BY g.product_id, g.code ORDER BY g.product_id, g.code`,
  media: `SELECT product_id, count(*)::int AS refs FROM public.catalog_media_refs WHERE revision_id = $1::uuid GROUP BY product_id`,
  categories: `SELECT count(*)::int AS categories FROM public.category_entries WHERE revision_id = $1::uuid`,
});

export const buildReport = async client => {
  await client.query("BEGIN READ ONLY");
  try {
    const { rows: revisions } = await client.query(reportQueries.revisions);
    const out = [];
    for (const revision of revisions) {
      const rows = {};
      for (const name of ["products", "variants", "groups", "media", "categories"]) rows[name] = (await client.query(reportQueries[name], [revision.id])).rows;
      const { products, variants, groups, media, categories } = rows;
      const entries = products.map(product => {
        const own = variants.filter(row => row.product_id === product.product_id).map(row => ({ code: row.code, basePrice: Number(row.base_price) }));
        const ownGroups = groups.filter(row => row.product_id === product.product_id);
        return { slug: product.slug, title: product.title, category: product.category_slug, variants: own,
          modifierGroups: ownGroups.map(row => ({ code: row.group_code, options: row.options, maxPriceDelta: Number(row.max_price_delta), totalPriceDelta: Number(row.total_price_delta) })),
          mediaRefs: media.find(row => row.product_id === product.product_id)?.refs ?? 0 };
      });
      out.push({ revisionId: revision.id, status: revision.status, version: revision.version, live: revision.live,
        productCount: entries.length, categoryCount: categories[0]?.categories ?? 0,
        multiVariantProducts: entries.filter(row => row.variants.length > 1),
        productsWithModifiers: entries.filter(row => row.modifierGroups.length),
        singleVariantProducts: entries.filter(row => row.variants.length === 1 && !row.modifierGroups.length).length,
        productsWithoutVariant: entries.filter(row => row.variants.length === 0).map(row => row.slug),
        productsWithMedia: entries.filter(row => row.mediaRefs > 0).map(row => ({ slug: row.slug, refs: row.mediaRefs })) });
    }
    return { generatedAt: new Date().toISOString(), revisions: out,
      note: "Products with >1 variant or any costed modifier need an Owner decision per product before stage 2." };
  } finally {
    await client.query("ROLLBACK");
  }
};
