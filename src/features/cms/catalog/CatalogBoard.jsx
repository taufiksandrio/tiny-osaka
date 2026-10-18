"use client";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProductCard from "./ProductCard";
import ProductModal from "./ProductModal";
import useCatalogCards from "./useCatalogCards";
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const CatalogBoard = ({ initial }) => {
  const { products, busySlug, saving, announcement, save, remove } = useCatalogCards(initial);
  const [modal, setModal] = useState(null); // null | { product?: card }; client state only, never in the URL
  const [serverError, setServerError] = useState(null); // { message, field? }
  const listRef = useRef(null), openerRef = useRef(null);
  const owner = initial.role === "owner";
  const open = (product, opener) => { openerRef.current = opener; setServerError(null); setModal({ product }); };
  const submit = async values => {
    setServerError(null);
    const result = await save(modal.product, values);
    if (result.ok || result.gone) setModal(null);
    else setServerError({ message: result.message, field: result.field });
  };
  const del = async product => { if (await remove(product)) listRef.current?.focus(); };
  // Return focus to the opener; fall back to the list heading if that card no longer exists.
  const restoreFocus = event => { event.preventDefault(); const opener = openerRef.current; (opener?.isConnected && !opener.disabled ? opener : listRef.current)?.focus(); };
  const editing = modal?.product && products.find(row => row.slug === modal.product.slug);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div className="space-y-3"><h1>Katalog menu</h1>
        <p className="text-muted-foreground">Setiap perubahan langsung tampil di website publik. Produk terbaru berada di atas.{!owner && " Hanya Owner yang dapat menghapus produk."}</p></div>
      <Button type="button" className="min-h-11" onClick={event => open(undefined, event.currentTarget)}><Plus aria-hidden="true" />Tambah produk</Button>
    </div>
    <div role="status" aria-live="polite" aria-atomic="true" className={announcement ? "rounded-md border bg-muted px-4 py-3 text-sm" : "sr-only"}>{announcement}</div>
    <h2 ref={listRef} tabIndex={-1} className="text-xl outline-none">Daftar produk ({products.length})</h2>
    {!products.length ? <Card className="shadow-none"><CardContent className="py-8"><p className="text-muted-foreground">Belum ada produk. Pilih Tambah produk untuk memulai.</p></CardContent></Card> :
      <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-label="Produk katalog">
        {products.map(product => <ProductCard key={product.slug} product={product} canDelete={owner} busy={busySlug === product.slug} onEdit={open} onDelete={del} />)}
      </ul>}
    {initial.updatedAt && <p className="text-xs text-muted-foreground">Data dimuat <time dateTime={new Date(initial.updatedAt).toISOString()}>{date.format(new Date(initial.updatedAt))} WIB</time></p>}
    <ProductModal open={Boolean(modal)} product={editing ?? modal?.product} busy={saving} serverError={serverError} onSubmit={submit} onClose={() => setModal(null)} onCloseAutoFocus={restoreFocus} />
  </div>;
};
export default CatalogBoard;
