"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LanguageSwitcher = ({ locale, label }) => {
  const pathname = usePathname();
  const segments = pathname.split("/");
  const translatedPath = (language) => {
    const translated = [...segments];
    translated[1] = language;
    return translated.join("/");
  };

  return (
    <nav className="language-nav" aria-label={label}>
      <Link href={translatedPath("id")} lang="id" hrefLang="id" aria-current={locale === "id" ? "page" : undefined}>ID</Link>
      <span aria-hidden="true">/</span>
      <Link href={translatedPath("en")} lang="en" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>EN</Link>
    </nav>
  );
};

export default LanguageSwitcher;
