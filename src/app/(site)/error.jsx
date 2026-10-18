"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const PublicError = ({ reset }) => (
  <main id="main-content" className="container friendly-state" tabIndex={-1}>
    <span className="friendly-mark" aria-hidden="true">!</span>
    <h1>Konten sementara tidak tersedia</h1>
    <div className="friendly-actions">
      <Button size="lg" onClick={reset}>Coba lagi</Button>
      <Button asChild size="lg" variant="outline"><Link href="/">Kembali ke beranda</Link></Button>
    </div>
  </main>
);

export default PublicError;
