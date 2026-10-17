import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import { content } from "@/features/public-site/content";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import { sampleMenu } from "@/features/public-site/fixtures/menu";
import PageIntro from "@/features/public-site/components/PageIntro";
import MenuCard from "@/features/public-site/components/MenuCard";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async () => usesPublishedContent() ? publishedMetadata("menu") : getPageMetadata("menu");

const MenuPage = async () => {
  if (usesPublishedContent()) return <PublishedPage pageKey="menu" />;
  const copy = getPageContent();
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro copy={copy} intro={copy.pages.menu} />
      <section className="page-section container" aria-labelledby="sample-menu-title">
        <h2 className="section-title" id="sample-menu-title">{copy.sampleHeading}</h2>
        <div className="menu-grid">
          {sampleMenu.map((item) => <MenuCard key={item.id} item={item} copy={content} />)}
        </div>
      </section>
      <OrderingNotice copy={content} />
    </main>
  );
};

export default MenuPage;
