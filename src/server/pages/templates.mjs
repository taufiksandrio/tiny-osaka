// Field/route ownership stays in code. These records never contain restaurant facts.
const common = { eyebrow: "short", title: "title", summary: "summary",
  seoTitle: "title", seoDescription: "summary", body: "rich" };
const specs = {
  home: { ...common, menuTitle: "title", menuIntro: "summary", aboutTitle: "title",
    aboutBody: "rich", primaryCtaLabel: "short", secondaryCtaLabel: "short" },
  about: { ...common, storyHeading: "title", storyBody: "rich",
    serviceHeading: "title", serviceBody: "rich" },
  menu: { ...common },
  guides: { ...common },
  guide: { ...common },
  promos: { ...common },
  location: { ...common, city: "short", service: "short", hours: "summary", coverage: "summary" },
};
export const pageTemplateFields = Object.freeze(Object.fromEntries(
  Object.entries(specs).map(([key, fields]) => [key, Object.freeze(fields)])));
export const pageDefinitions = Object.freeze(Object.fromEntries([
  ["home", "home", ""], ["about", "about", "/about"], ["menu", "menu", "/menu"],
  ["guides", "guides", "/guides"], ["promos", "promos", "/promos"], ["location", "location", "/location"],
  ...["takoyaki", "okonomiyaki", "burger"].map(slug => ["guide-" + slug, "guide", "/guides/" + slug]),
].map(([key, template, path]) => [key, Object.freeze({ key, template, path })])));
export const getPageDefinition = key => typeof key === "string" && Object.hasOwn(pageDefinitions, key) ? pageDefinitions[key] : null;
export const isPageLocale = locale => locale === "id";
export const pageNames = Object.freeze({ home: "Beranda", about: "Tentang", menu: "Menu", guides: "Panduan makanan", promos: "Promo", location: "Lokasi dan layanan",
  "guide-takoyaki": "Panduan takoyaki", "guide-okonomiyaki": "Panduan okonomiyaki", "guide-burger": "Panduan burger" });
// Public URLs have no language segment. Links saved earlier with "/id" or "/en" stay valid so snapshots can be cloned.
export const publicPagePath = page => page.path || "/";
export const isInternalPageLink = href => typeof href === "string" &&
  Object.values(pageDefinitions).some(page => href === publicPagePath(page) || ["id", "en"].some(locale => href === "/" + locale + page.path));

