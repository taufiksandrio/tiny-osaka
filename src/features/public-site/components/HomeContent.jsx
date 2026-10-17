import Image from "next/image";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import PublicRichText from "./PublicRichText";
const copy = {
  id: { caption: "Takoyaki Shio Negi · Tiny Osaka", alt: "Takoyaki Shio Negi Tiny Osaka disajikan dalam wadah berbentuk perahu", menu: "KATALOG", about: "TINY OSAKA", empty: "Menu belum diterbitkan.", menuLink: "Lihat seluruh menu", draft: "Pratinjau draf · belum diterbitkan" },
  en: { caption: "Takoyaki Shio Negi · Tiny Osaka", alt: "Tiny Osaka Takoyaki Shio Negi served in a boat-shaped tray", menu: "THE CATALOG", about: "TINY OSAKA", empty: "The menu has not been published yet.", menuLink: "Explore all menu items", draft: "Draft preview · not published" },
};
const HomeContent = ({ fields, locale, catalogContent, mediaContent, orderingContent, preview = false }) => {
  const text = copy[locale];
  const fallback = locale === "id" ? { title: "Judul belum diisi", summary: "Ringkasan belum diisi.", menu: "Menu Tiny Osaka", about: "Tentang Tiny Osaka", primary: "Lihat menu", secondary: "Tentang Tiny Osaka" } :
    { title: "Title not yet provided", summary: "Summary not yet provided.", menu: "Tiny Osaka menu", about: "About Tiny Osaka", primary: "Explore the menu", secondary: "About Tiny Osaka" };
  const Wrapper = preview ? "div" : "main";
  const Title = preview ? "h2" : "h1";
  return <Wrapper className="home-theme" {...(preview ? { "aria-label": "Pratinjau desain home" } : { id: "main-content", tabIndex: -1 })}>
    <section className="home-hero container" aria-labelledby={preview ? "home-preview-title" : "home-title"}>
      <div className="space-y-7 min-w-0">
        {preview && <Badge variant="outline">{text.draft}</Badge>}
        <p className="home-kicker">{fields.eyebrow}</p>
        <Title id={preview ? "home-preview-title" : "home-title"} className="home-headline">{fields.title || fallback.title}</Title>
        {(fields.summary || preview) && <p className="home-summary">{fields.summary || fallback.summary}</p>}
        <div className="flex flex-wrap gap-3"><Button asChild size="lg"><Link href={`/${locale}/menu`}>{fields.primaryCtaLabel || fallback.primary}<ArrowUpRight aria-hidden="true" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link href={`/${locale}/about`}>{fields.secondaryCtaLabel || fallback.secondary}<ArrowRight aria-hidden="true" /></Link></Button></div>
      </div>
      <figure className="home-art"><Image src="/images/02a - Takoyaki Shio Negi.jpeg" alt={text.alt} width={1600} height={1200} unoptimized
        sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1280px) 48vw, 600px" preload={!preview} className="home-art-image" />
        <figcaption>{text.caption}</figcaption></figure>
    </section>
    <section className="container home-story" aria-label={locale === "id" ? "Mengenal Tiny Osaka" : "Meet Tiny Osaka"}><div className="home-prose"><PublicRichText document={fields.body} /></div></section>
    <section className="container home-menu" aria-labelledby={preview ? "home-preview-menu" : "home-menu"}>
      <div className="flex flex-wrap items-end justify-between gap-6"><div className="space-y-3 min-w-0"><p className="home-kicker">{text.menu}</p><h2 id={preview ? "home-preview-menu" : "home-menu"}>{fields.menuTitle || fallback.menu}</h2><p className="home-section-intro">{fields.menuIntro}</p></div>
        <Button asChild variant="outline"><Link href={`/${locale}/menu`}>{text.menuLink}<ArrowRight aria-hidden="true" /></Link></Button></div>
      <div className="mt-8">{catalogContent ?? <Card className="border-dashed shadow-none"><CardContent><p>{text.empty}</p></CardContent></Card>}</div>
    </section>
    <section className="container home-about" aria-labelledby={preview ? "home-preview-about" : "home-about"}>
      <Card className="home-about-card shadow-none"><CardHeader><p className="home-kicker">{text.about}</p><h2 id={preview ? "home-preview-about" : "home-about"} className="whitespace-pre-line">{fields.aboutTitle || fallback.about}</h2></CardHeader>
        <CardContent className="home-prose space-y-6"><PublicRichText document={fields.aboutBody} /><Button asChild variant="outline"><Link href={`/${locale}/about`}>{fields.secondaryCtaLabel || fallback.secondary}<ArrowRight aria-hidden="true" /></Link></Button></CardContent></Card>
      {mediaContent}
    </section>
    {orderingContent}
  </Wrapper>;
};
export default HomeContent;
