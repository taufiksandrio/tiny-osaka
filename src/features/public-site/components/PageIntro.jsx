import Link from "next/link";
import { Separator } from "@/components/ui/separator";

// One title block for every non-home route (fixture and published): breadcrumb, kicker, single h1, lead, rule.
// The "pratinjau" tag only shows in fixture mode (showPreview).
export const PUBLISHED_INTRO_COPY = { home: "Beranda", breadcrumb: "Jejak halaman", preview: "" };

export const Breadcrumbs = ({ copy, current, parents = [] }) => (
  <nav className="breadcrumbs" aria-label={copy.breadcrumb}>
    <ol>
      <li><Link href="/">{copy.home}</Link></li>
      {parents.map((parent) => <li key={parent.href}><Link href={parent.href}>{parent.label}</Link></li>)}
      <li aria-current="page">{current}</li>
    </ol>
  </nav>
);

const PageIntro = ({ copy, intro, parents = [], showPreview = true }) => (
  <section className="page-intro container" aria-labelledby="page-title">
    <Breadcrumbs copy={copy} parents={parents} current={intro.label || intro.title} />
    {intro.eyebrow && <p className="eyebrow">{intro.eyebrow}</p>}
    <h1 id="page-title">{intro.title}</h1>
    {intro.description && <p className="page-description">{intro.description}</p>}
    {showPreview && copy.preview && <span className="preview-tag">{copy.preview}</span>}
    <Separator className="page-intro-rule" />
  </section>
);

export default PageIntro;
