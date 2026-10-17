// Editorial draft approved for preparation, not an automatic public-content fallback.
// Facts: REQUIREMENTS.md / CONTENT_AND_UX.md. No menu, pricing or ingredient claims.
const paragraph = text => ({ blocks: [{ type: "paragraph", content: [{ text }] }] });
export const homeDraft = {
  id: {
    eyebrow: "TINY OSAKA · BANDUNG",
    title: "Japanese street food, dari Bandung.",
    summary: "Kenali Tiny Osaka, restoran Japanese street food dengan layanan khusus delivery di Bandung.",
    body: paragraph("Tiny Osaka berfokus pada Japanese street food dengan layanan khusus delivery di Bandung. Jelajahi cerita kami dan informasi menu yang sudah diterbitkan."),
    menuTitle: "Jelajahi menu Tiny Osaka",
    menuIntro: "Kenali pilihan kami melalui katalog. Nama, deskripsi, dan harga mengikuti informasi produk yang sudah diterbitkan.",
    aboutTitle: "Nuansa Osaka. Berangkat dari Bandung.",
    aboutBody: paragraph("Tiny Osaka membawa inspirasi Japanese street food melalui restoran khusus delivery di Bandung, Indonesia. Temukan pengenalan brand kami serta informasi layanan yang sudah tersedia."),
    primaryCtaLabel: "Lihat menu", secondaryCtaLabel: "Tentang Tiny Osaka",
    seoTitle: "Tiny Osaka | Japanese Street Food Delivery di Bandung",
    seoDescription: "Kenali Tiny Osaka, restoran Japanese street food khusus delivery di Bandung. Jelajahi informasi menu, cerita brand, dan layanan yang sudah diterbitkan.",
  },
  en: {
    eyebrow: "TINY OSAKA · BANDUNG",
    title: "Japanese street food, from Bandung.",
    summary: "Meet Tiny Osaka, a Japanese street-food restaurant offering delivery-only service in Bandung.",
    body: paragraph("Tiny Osaka focuses on Japanese street food, with delivery-only service in Bandung. Explore our story and the menu information published in our catalog."),
    menuTitle: "Explore the Tiny Osaka menu",
    menuIntro: "Get to know our selection through the catalog. Names, descriptions, and prices come from published product information.",
    aboutTitle: "Osaka-inspired. Based in Bandung.",
    aboutBody: paragraph("Tiny Osaka takes inspiration from Japanese street food, with a delivery-only restaurant in Bandung, Indonesia. Discover our brand and the service information currently available."),
    primaryCtaLabel: "Explore the menu", secondaryCtaLabel: "About Tiny Osaka",
    seoTitle: "Tiny Osaka | Japanese Street Food Delivery in Bandung",
    seoDescription: "Meet Tiny Osaka, a delivery-only Japanese street-food restaurant in Bandung. Explore published menu information, our brand story, and service details.",
  },
};
const hasContent = value => typeof value === "string" ? Boolean(value.trim()) : Boolean(value?.blocks?.some(block =>
  (block.content ?? block.items?.flat() ?? []).some(span => span.text?.trim())));
export const fillHomeDraft = current => Object.fromEntries(["id", "en"].map(locale => [locale,
  Object.fromEntries(Object.entries(homeDraft[locale]).map(([key, value]) => [key, hasContent(current[locale]?.[key]) ? current[locale][key] : structuredClone(value)])),
]));
