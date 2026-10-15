import { content } from "@/features/public-site/content";
import { getPageContent, getPageMetadata } from "@/features/public-site/page-content";
import { sampleMenu } from "@/features/public-site/fixtures/menu";
import PageIntro from "@/features/public-site/components/PageIntro";
import MenuCard from "@/features/public-site/components/MenuCard";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async ({ params }) => getPageMetadata((await params).locale, "menu");

const MenuPage = async ({ params }) => {
  const { locale } = await params;
  const copy = getPageContent(locale);
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro locale={locale} copy={copy} intro={copy.pages.menu} />
      <section className="page-section container" aria-labelledby="sample-menu-title">
        <h2 className="section-title" id="sample-menu-title">{copy.sampleHeading}</h2>
        <div className="menu-grid">
          {sampleMenu.map((item) => <MenuCard key={item.id} item={item} locale={locale} copy={content[locale]} />)}
        </div>
      </section>
      <OrderingNotice copy={content[locale]} />
    </main>
  );
};

export default MenuPage;
