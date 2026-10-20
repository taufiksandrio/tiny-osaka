import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import { content } from "@/features/public-site/content";
import { sampleMenu } from "@/features/public-site/fixtures/menu";
import HomeContent from "@/features/public-site/components/HomeContent";
import { MenuCardGrid } from "@/features/public-site/components/MenuCard";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async () => usesPublishedContent() ? publishedMetadata("home") : {};

const paragraph = text => ({ type: "paragraph", content: [{ text }] });

const HomePage = async () => {
  if (usesPublishedContent()) return <PublishedPage pageKey="home" />;
  const copy = content;
  // Fixture mode reuses the real home layout; labelled sample cards stand in for products (no photo, price or order button).
  const fields = { eyebrow: copy.eyebrow, title: copy.hero.join("\n"), summary: copy.intro, menuTitle: copy.menuTitle, menuIntro: copy.menuIntro,
    aboutTitle: copy.aboutTitle, aboutBody: { blocks: [paragraph(copy.aboutBody), paragraph(copy.aboutNote)] },
    primaryCtaLabel: copy.explore, secondaryCtaLabel: copy.aboutLink, secondaryCtaHref: "/menu" };
  return <HomeContent fields={fields} note={copy.heroNote}
    catalogContent={<MenuCardGrid items={sampleMenu} copy={copy} headingLevel="h3" />}
    orderingContent={<OrderingNotice copy={copy} />} />;
};

export default HomePage;
