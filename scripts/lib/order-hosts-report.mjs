import { ORDER_LINK_KEYS, OFFICIAL_ORDER_HOSTS, publicOrderLinks } from "../../src/server/catalog/order-links.mjs";

// Read-only analysis of stored order links. Only parses hostnames from text; no network access, no writes.
export const hostOf = value => {
  if (typeof value !== "string" || !value.trim()) return null;
  try { return new URL(value.trim()).hostname || "(invalid)"; } catch { return "(invalid)"; }
};

export const summarizeOrderHosts = (rows, hosts = OFFICIAL_ORDER_HOSTS) => {
  const platforms = {};
  for (const key of ORDER_LINK_KEYS) platforms[key] = { links: 0, hosts: {}, accepted: 0, rejected: 0 };
  let productsWithRejected = 0;
  for (const row of rows) {
    const accepted = new Set(publicOrderLinks(row, hosts).map(link => link.platform));
    let anyRejected = false;
    for (const key of ORDER_LINK_KEYS) {
      const host = hostOf(row[key]);
      if (host === null) continue;
      const bucket = platforms[key];
      bucket.links += 1;
      bucket.hosts[host] = (bucket.hosts[host] ?? 0) + 1;
      const platform = key.replace("Url", "");
      if (accepted.has(platform)) bucket.accepted += 1; else { bucket.rejected += 1; anyRejected = true; }
    }
    if (anyRejected) productsWithRejected += 1;
  }
  for (const key of ORDER_LINK_KEYS) {
    platforms[key].hosts = Object.fromEntries(Object.entries(platforms[key].hosts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  }
  return { products: rows.length, productsWithRejected, platforms };
};

export const orderLinkRowsQuery = `SELECT e.product_id, e.grabfood_url AS "grabfoodUrl", e.gofood_url AS "gofoodUrl", e.shopeefood_url AS "shopeefoodUrl"
  FROM public.product_entries e
  WHERE e.revision_id = (SELECT revision_id FROM public.catalog_publication WHERE id = 1)
  ORDER BY e.product_id`;
