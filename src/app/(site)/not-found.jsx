import Link from "next/link";
import { Button } from "@/components/ui/button";

const SiteNotFound = () => (
  <main id="main-content" className="container friendly-state" tabIndex={-1}>
    <span className="friendly-mark" aria-hidden="true">?</span>
    <h1>Halaman tidak ditemukan</h1>
    <p>Alamat yang Anda buka tidak tersedia.</p>
    <div className="friendly-actions">
      <Button asChild size="lg"><Link href="/">Kembali ke beranda</Link></Button>
      <Button asChild size="lg" variant="outline"><Link href="/menu">Lihat menu</Link></Button>
    </div>
  </main>
);

export default SiteNotFound;
