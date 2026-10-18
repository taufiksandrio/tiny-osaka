import Link from "next/link";
import "@/styles/globals.css";

// Served for any unmatched URL (including any address with a language prefix). Indonesian only, with an explicit html lang.
export const metadata = { title: "Halaman tidak ditemukan | Tiny Osaka", robots: { index: false, follow: false } };

const GlobalNotFound = () => (
  <html lang="id">
    <body>
      <main id="main-content" className="container page-section" tabIndex={-1}>
        <h1>Halaman tidak ditemukan</h1>
        <p>Alamat yang Anda buka tidak tersedia.</p>
        <Link className="button button-red" href="/">Kembali ke beranda</Link>
      </main>
    </body>
  </html>
);

export default GlobalNotFound;
