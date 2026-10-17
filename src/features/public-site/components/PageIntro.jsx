import Link from "next/link";

const PageIntro = ({ copy, intro, parents = [] }) => (
  <section className="page-intro container" aria-labelledby="page-title">
    <nav className="breadcrumbs" aria-label={copy.breadcrumb}>
      <ol>
        <li><Link href="/">{copy.home}</Link></li>
        {parents.map((parent) => <li key={parent.href}><Link href={parent.href}>{parent.label}</Link></li>)}
        <li aria-current="page">{intro.label || intro.title}</li>
      </ol>
    </nav>
    <p className="eyebrow">{intro.eyebrow}</p>
    <h1 id="page-title">{intro.title}</h1>
    <p className="page-description">{intro.description}</p>
    <span className="preview-tag">{copy.preview}</span>
  </section>
);

export default PageIntro;
