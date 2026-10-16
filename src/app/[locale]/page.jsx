import { usesPublishedContent } from "@/server/public/data.mjs";
import { PublishedPage, publishedMetadata } from "@/features/public-site/components/PublishedContent";
import { notFound } from "next/navigation";
import Link from "next/link";
import { content } from "@/features/public-site/content";
import { sampleMenu } from "@/features/public-site/fixtures/menu";
import MenuCard from "@/features/public-site/components/MenuCard";
import OrderingNotice from "@/features/public-site/components/OrderingNotice";

export const generateMetadata = async ({ params }) => usesPublishedContent() ? publishedMetadata("home", (await params).locale) : {};

const HomePage = async ({ params }) => {
  const { locale } = await params;
  if (usesPublishedContent()) return <PublishedPage pageKey="home" locale={locale} />;
  if (!Object.hasOwn(content, locale)) notFound();
  const copy = content[locale];

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="small-dot" aria-hidden="true" />{copy.eyebrow}</p>
          <h1 id="hero-title">{copy.hero[0]}<br /><span>{copy.hero[1]}</span></h1>
          <p className="hero-intro">{copy.intro}</p>
          <div className="hero-actions">
            <Link className="button button-red" href={`/${locale}/menu`}>{copy.explore}<span aria-hidden="true">↗</span></Link>
            <Link className="text-link" href={`/${locale}/about`}>{copy.aboutLink}<span aria-hidden="true">→</span></Link>
          </div>
          <p className="hero-note">{copy.heroNote}</p>
        </div>
        <figure className="hero-visual">
          <div className="visual-frame" aria-hidden="true">
            <span className="visual-corner">TINY OSAKA / 01</span>
            <div className="graphic-disc"><span>TINY<br />OSAKA<span className="disc-star">✳</span></span></div>
            <span className="visual-japanese" lang="ja">大阪</span>
            <span className="visual-bottom">{copy.visualLabel}</span>
          </div>
          <figcaption>{copy.visualNote}</figcaption>
        </figure>
      </section>

      <section className="menu-section" id="menu" aria-labelledby="menu-title">
        <div className="container">
          <div className="section-heading">
            <div><p className="eyebrow">{copy.menuEyebrow}</p><h2 id="menu-title">{copy.menuTitle}</h2></div>
            <p>{copy.menuIntro}</p>
          </div>
          <div className="menu-grid">
            {sampleMenu.map((item) => (
              <MenuCard key={item.id} item={item} locale={locale} copy={copy} />
            ))}
          </div>
        </div>
      </section>

      <section className="about-section container" id="about" aria-labelledby="about-title">
        <div className="about-mark" aria-hidden="true"><span lang="ja">大阪</span><span>TINY OSAKA</span></div>
        <div className="about-copy">
          <p className="eyebrow">{copy.aboutEyebrow}</p>
          <h2 className="preserve-lines" id="about-title">{copy.aboutTitle}</h2>
          <p>{copy.aboutBody}</p><p className="content-note">{copy.aboutNote}</p>
          <Link className="text-link" href={`/${locale}/about`}>{copy.aboutLink}<span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <OrderingNotice copy={copy} />
    </main>
  );
};

export default HomePage;
