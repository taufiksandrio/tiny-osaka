import Link from "next/link";

const SiteNotFound = () => (
  <main id="main-content" className="container page-section" tabIndex={-1}>
    <h1>Halaman tidak ditemukan</h1>
    <p>Alamat yang Anda buka tidak tersedia.</p>
    <Link className="button button-red" href="/">Kembali ke beranda</Link>
  </main>
);

export default SiteNotFound;
