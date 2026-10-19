import { ROBOTS_NOINDEX } from "@/server/public/indexing.mjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import "@/styles/globals.css";

// Served for any unmatched URL (including any address with a language prefix). Indonesian only, with an explicit html lang.
export const metadata = { title: "Halaman tidak ditemukan | Tiny Osaka", robots: ROBOTS_NOINDEX };

const GlobalNotFound = () => (
  <html lang="id">
    <body className="site-root">
      <main id="main-content" className="container friendly-state" tabIndex={-1}>
        <span className="friendly-mark" aria-hidden="true">?</span>
        <h1>Halaman tidak ditemukan</h1>
        <p>Alamat yang Anda buka tidak tersedia.</p>
        <div className="friendly-actions">
          <Button asChild size="lg"><Link href="/">Kembali ke beranda</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/menu">Lihat menu</Link></Button>
        </div>
      </main>
    </body>
  </html>
);

export default GlobalNotFound;
