"use client";
import { SchedulePanel } from "../publishing/Publications";
import { useEffect, useState } from "react";
import { CatalogContext, catalogRequest } from "./client";
import { CatalogForm, orderField } from "./CatalogForm";
import CategoryForm from "./CategoryForm";
import ProductForm from "./ProductForm";
import CatalogPreview from "./CatalogPreview";
import CatalogActions from "./CatalogActions";
import RevisionStatus from "../pages/RevisionStatus";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
const issueLabels = { EMPTY_CATALOG: "Tambahkan minimal satu kategori dan produk.", MISSING_TRANSLATION: "Lengkapi nama dan deskripsi dalam bahasa ini.",
  MISSING_VARIANT: "Tambahkan varian standard dan harga dasar.", INVALID_PRICING_GRAPH: "Periksa kode varian, harga, serta batas pilihan modifier.",
  PRICE_TOTAL_OVERFLOW: "Total kombinasi harga melampaui batas yang didukung.", INVALID_MEDIA_GRAPH: "Periksa referensi media produk.",
  INVALID_SORT: "Periksa urutan tampil.", INVALID_TEXT: "Periksa nama dan deskripsi." };
const CatalogEditor = ({ initial, role }) => {
  const [graph, setGraph] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [dirty, setDirty] = useState({}), [changes, setChanges] = useState({}), [preview, setPreview] = useState(false), [locale, setLocale] = useState("id"), [readiness, setReadiness] = useState(null);
  const unsaved = Object.values(dirty).some(Boolean), revision = graph.revision;
  const issueName = issue => [...graph.categories, ...graph.products, ...graph.productVariants, ...graph.modifierGroups, ...graph.modifierOptions]
    .find(row => row.id === issue.entityId)?.slug ?? [...graph.productVariants, ...graph.modifierGroups, ...graph.modifierOptions].find(row => row.id === issue.entityId)?.code ?? "Katalog";
  useEffect(() => {
    if (!unsaved) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const mutate = async (action, data) => {
    setBusy(true); setMessage("");
    try {
      const next = await catalogRequest(`/${revision.id}`, { action, data: { revisionId: revision.id, expectedVersion: revision.version, ...data } }, "PATCH");
      setGraph(next); setReadiness(null); setMessage("Perubahan tersimpan."); return true;
    } catch (error) { setMessage(error.message); return false; } finally { setBusy(false); }
  };
  const previewGraph = { ...graph };
  for (const change of Object.values(changes)) {
    const matches = row => Object.entries(change.match).every(([key, value]) => row[key] === value);
    const rows = previewGraph[change.table];
    previewGraph[change.table] = rows.some(matches) ? rows.map(row => matches(row) ? { ...row, ...change.values } : row) :
      [...rows, { revisionId: revision.id, ...change.create, ...change.values }];
  }
  const context = { disabled: busy || revision.status !== "draft", mutate,
    media: { version: revision.version, status: revision.status, revisionId: revision.id, onBusy: setBusy,
      onChange: async version => {
        const next = await catalogRequest(`/${revision.id}`, undefined, "GET");
        if (next.revision.version === version) setGraph(next);
        else { setGraph(previous => ({ ...previous, revision: { ...previous.revision, version } })); setMessage("Revisi berubah lagi. Salin perubahan sebelum memuat ulang."); }
        setReadiness(null);
      } },
    setDirty: (id, value) => setDirty(previous => ({ ...previous, [id]: value })),
    overlay: (id, value) => setChanges(previous => ({ ...previous, [id]: value })) };
  return <CatalogContext.Provider value={context}><div className="cms-editor grid gap-6">
    <Card className="shadow-none"><CardHeader><div className="flex flex-wrap gap-3"><RevisionStatus status={revision.status} /><Badge variant="outline">Versi: {revision.version}</Badge>
      {graph.isLive && <Badge>Sedang tampil di publik</Badge>}</div><CardDescription>Kategori, produk, varian, dan modifier disimpan dalam satu revisi katalog. Lengkapi kedua bahasa sebelum review.</CardDescription></CardHeader>
      <CardContent className="grid gap-6">{revision.status !== "draft" && <p className="rounded-lg bg-secondary p-4">Revisi ini dibekukan. Buat draft dari revisi ini untuk mengubah konten.</p>}
        <div className="cms-button-row"><Button variant="outline" onClick={() => setPreview(!preview)}>{preview ? "Kembali ke editor" : "Pratinjau katalog"}</Button>
          {revision.status === "draft" && <Button variant="outline" disabled={busy || unsaved} onClick={async () => {
            setBusy(true); setMessage("");
            try { setReadiness(await catalogRequest(`/${revision.id}/actions`, { action: "readiness", data: { revisionId: revision.id, expectedVersion: revision.version } })); }
            catch (error) { setMessage(error.message); } finally { setBusy(false); }
          }}>Periksa kesiapan</Button>}</div>
        <p role="status" aria-live="polite">{message || (unsaved ? "Ada perubahan belum disimpan." : "")}</p>
        {readiness && <div className="rounded-lg border p-4"><h2>{readiness.ready ? "Katalog siap diajukan" : "Katalog belum lengkap"}</h2><p className="mt-2 text-xs text-muted-foreground">Hasil untuk versi {readiness.version}. Pemeriksaan struktur belum memverifikasi fakta restoran atau harga platform.</p>
          {!!readiness.issues.length && <ul className="mt-3 grid gap-2">{readiness.issues.map((issue, index) => <li key={index} className="break-words text-sm"><strong>{issueName(issue)}{issue.locale ? ` (${issue.locale === "id" ? "Indonesia" : "Inggris"})` : ""}:</strong> {issueLabels[issue.code] ?? "Periksa kelengkapan dan keterkaitan isian katalog."}</li>)}</ul>}</div>}
      </CardContent></Card>
    {preview && <><div className="cms-form-field justify-self-start"><Label htmlFor="catalog-preview-locale">Bahasa preview</Label><NativeSelect id="catalog-preview-locale" value={locale} onChange={event => setLocale(event.target.value)}><NativeSelectOption value="id">Indonesia</NativeSelectOption><NativeSelectOption value="en">Inggris</NativeSelectOption></NativeSelect></div><CatalogPreview graph={previewGraph} locale={locale} unsaved={unsaved} /></>}
    <div hidden={preview} className="space-y-6">
      <Card className="shadow-none"><CardHeader><h2>Kategori</h2><CardDescription>Slug tetap menjadi identitas kategori. Atur nama bilingual dan urutan tampil.</CardDescription></CardHeader><CardContent className="grid min-w-0 gap-6">
        {[...graph.categoryEntries].sort((a, b) => a.sortOrder - b.sortOrder).map(entry => {
          const category = graph.categories.find(row => row.id === entry.categoryId);
          return <details key={category.id} className="min-w-0 rounded-lg border p-4"><summary className="cursor-pointer break-all font-medium">{category.slug}</summary><div className="mt-6"><CategoryForm category={category} graph={graph} /></div></details>;
        })}
        <CatalogForm title="Tambah kategori" action="categoryCreate" initial={{ slug: "", sortOrder: 0 }} fields={[{ name: "slug", label: "Slug kategori" }, orderField]} reset button="Tambah kategori" />
      </CardContent></Card>
      <Card className="shadow-none"><CardHeader><h2>Produk</h2><CardDescription>Harga berupa rupiah bulat. Penambahan produk, varian, dan modifier tersimpan sebagai draft.</CardDescription></CardHeader><CardContent className="grid min-w-0 gap-6">
        {[...graph.productEntries].sort((a, b) => a.sortOrder - b.sortOrder).map(entry => {
          const product = graph.products.find(row => row.id === entry.productId);
          return <details key={product.id} className="min-w-0 rounded-lg border p-4"><summary className="cursor-pointer break-all font-medium">{product.slug}</summary><div className="mt-6"><ProductForm product={product} graph={graph} /></div></details>;
        })}
        {graph.categories.length ? <CatalogForm title="Tambah produk" action="productCreate" initial={{ slug: "", categoryId: "", sortOrder: 0 }} reset button="Tambah produk"
          fields={[{ name: "slug", label: "Slug produk" }, { name: "categoryId", label: "Kategori produk", options: [{ value: "", label: "Pilih kategori" }, ...graph.categories.map(row => ({ value: row.id, label: row.slug }))] }, orderField]} /> : <p className="text-sm text-muted-foreground">Tambahkan kategori sebelum membuat produk.</p>}
      </CardContent></Card>
    </div>
    <SchedulePanel domain="catalog" revision={revision} role={role} disabled={busy || unsaved} />
    <CatalogActions graph={graph} role={role} busy={busy} disabled={unsaved} onBusy={setBusy} onChange={next => { setGraph(next); setChanges({}); setReadiness(null); }} onMessage={setMessage} />
  </div></CatalogContext.Provider>;
};
export default CatalogEditor;
