import Image from "next/image";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import PublicRichText from "./PublicRichText";
const text = { menu: "KATALOG", about: "TINY OSAKA", empty: "Menu belum diterbitkan.", menuLink: "Lihat seluruh menu", storyLabel: "Mengenal Tiny Osaka" };
const fallback = { title: "Judul belum diisi", summary: "Ringkasan belum diisi.", menu: "Menu Tiny Osaka", about: "Tentang Tiny Osaka", primary: "Lihat menu", secondary: "Tentang Tiny Osaka" };
const renderTitle = (title, accent) => {
  const at = accent && title ? title.indexOf(accent) : -1;
  return at < 0 ? title : <>{title.slice(0, at)}<em>{accent}</em>{title.slice(at + accent.length)}</>;
};
const hasBlocks = document => Boolean(document?.blocks?.length);

// Same component renders the public home (main, h1) and the CMS preview (div, h2). Preview has no media/catalog.
// Section order: hero, story, featured menu, short about, ordering notice. Empty fields are not rendered.
const HomeContent = ({ fields, catalogContent, heroMedia, mediaContent, orderingContent, note, preview = false }) => {
  const Wrapper = preview ? "div" : "main";
  const Title = preview ? "h2" : "h1";
  const about = Boolean(fields.aboutTitle) || hasBlocks(fields.aboutBody) || preview;
  return <Wrapper className="home-theme" {...(preview ? { "aria-label": "Pratinjau desain home" } : { id: "main-content", tabIndex: -1 })}>
    <section className={`home-hero container${heroMedia ? "" : " home-hero-solo"}`} aria-labelledby={preview ? "home-preview-title" : "home-title"}>
      <div className="home-hero-copy">
        {preview && <Badge variant="outline">Pratinjau konten</Badge>}
        {fields.eyebrow && <p className="home-kicker">{fields.eyebrow}</p>}
        <Title id={preview ? "home-preview-title" : "home-title"} className="home-headline">{renderTitle(fields.title, fields.titleAccent) || fallback.title}</Title>
        {(fields.summary || preview) && <p className="home-summary">{fields.summary || fallback.summary}</p>}
        <div className="home-cta"><Button asChild size="lg"><Link href="/menu">{fields.primaryCtaLabel || fallback.primary}{!fields.primaryCtaLabel?.includes("→") && <ArrowUpRight aria-hidden="true" />}</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href={fields.secondaryCtaHref || "/about"}>{fields.secondaryCtaLabel || fallback.secondary}<ArrowRight aria-hidden="true" /></Link></Button></div>
        <dl className="home-meta"><div><dt>Fresh</dt><dd>dimasak saat dipesan</dd></div><div><dt>GoFood</dt><dd>&amp; GrabFood</dd></div></dl>
        {note && <p className="home-note">{note}</p>}
      </div>
      {heroMedia && <figure className="home-art">
        <div className="home-art-stage">
          <span className="home-art-kanji" aria-hidden="true">たこ焼き</span>
          <span className="home-art-sun" aria-hidden="true" />
          <span className="home-art-ring" aria-hidden="true" />
          <div className="home-art-frame"><Image src={`/media/${heroMedia.asset.id}`} alt={heroMedia.alt} fill quality={80} preload={!preview}
            sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1279px) 48vw, 560px" className="home-art-image" /></div>
          <span className="home-art-steam" aria-hidden="true"><i /><i /><i /></span>
          <p className="home-badge home-badge-order"><strong>Isi gurita asli</strong><span>8 pcs per porsi</span></p>
          <p className="home-badge home-badge-dish"><strong>★ Best seller</strong><span>Takoyaki Original</span></p>
        </div>
        {heroMedia.caption && <figcaption>{heroMedia.caption}</figcaption>}</figure>}
    </section>
    {hasBlocks(fields.body) && <>
      <div className="container"><Separator /></div>
      <section className="container home-story" aria-label={text.storyLabel}><PublicRichText document={fields.body} className="home-prose" /></section>
    </>}
    <section className="home-menu" aria-labelledby={preview ? "home-preview-menu" : "home-menu"}>
      <div className="container">
        <div className="home-section-head"><div className="min-w-0"><p className="home-kicker">{text.menu}</p><h2 id={preview ? "home-preview-menu" : "home-menu"}>{fields.menuTitle || fallback.menu}</h2>{fields.menuIntro && <p className="home-section-intro">{fields.menuIntro}</p>}</div>
          <Button asChild variant="outline"><Link href="/menu">{text.menuLink}<ArrowRight aria-hidden="true" /></Link></Button></div>
        <div className="home-menu-grid">{catalogContent ?? <Card className="empty-card"><CardContent><p>{text.empty}</p></CardContent></Card>}</div>
      </div>
    </section>
    {about && <section className={`container home-about${mediaContent ? " home-about-media" : ""}`} aria-labelledby={preview ? "home-preview-about" : "home-about"}>
      <Card className="home-about-card"><CardHeader><p className="home-kicker">{text.about}</p><h2 id={preview ? "home-preview-about" : "home-about"} className="whitespace-pre-line">{fields.aboutTitle || fallback.about}</h2></CardHeader>
        <CardContent className="space-y-6"><PublicRichText document={fields.aboutBody} className="home-prose" /><Button asChild variant="outline"><Link href="/about">{fields.secondaryCtaLabel || fallback.secondary}<ArrowRight aria-hidden="true" /></Link></Button></CardContent></Card>
      {mediaContent && <div className="home-about-photos">{mediaContent}</div>}
    </section>}
    {orderingContent}
  </Wrapper>;
};
export default HomeContent;
