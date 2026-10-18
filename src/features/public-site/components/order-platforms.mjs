// Display metadata and defensive normalisation for public order links ([{ platform, href }] from the server).
// The server already validated hosts; this only fixes order, drops unknown platforms and non-https values.
export const ORDER_PLATFORMS = Object.freeze([
  Object.freeze({ id: "gofood", label: "GoFood" }),
  Object.freeze({ id: "grabfood", label: "GrabFood" }),
  Object.freeze({ id: "shopeefood", label: "ShopeeFood" }),
]);
export const ORDER_LINK_REL = "noopener noreferrer nofollow";
export const orderAriaLabel = platform => `Pesan lewat ${platform.label}`;
export const normalizeOrderLinks = links => {
  if (!Array.isArray(links)) return [];
  return ORDER_PLATFORMS.flatMap(platform => {
    const link = links.find(row => row?.platform === platform.id && typeof row.href === "string" && row.href.startsWith("https://"));
    return link ? [{ ...platform, href: link.href }] : [];
  });
};
