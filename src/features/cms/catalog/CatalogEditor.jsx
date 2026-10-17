"use client";
import { SchedulePanel } from "../publishing/Publications";
import { useEffect, useState } from "react";
import { addCatalogItem } from "./editor-state.mjs";
import { CatalogContext, catalogRequest } from "./client";
import { CatalogForm } from "./CatalogForm";
import CategoryForm from "./CategoryForm";
import ProductForm from "./ProductForm";
import CatalogPreview from "./CatalogPreview";
import CatalogActions from "./CatalogActions";
import RevisionStatus from "../pages/RevisionStatus";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
const issueLabels = { EMPTY_CATALOG: "Tambahkan minimal satu kategori dan produk.", MISSING_TRANSLATION: "Lengkapi nama dan deskripsi dalam konten Indonesia.",
  MISSING_VARIANT: "Tambahkan varian standard dan harga dasar.", INVALID_PRICING_GRAPH: "Periksa kode varian, harga, serta batas pilihan modifier.",
  PRICE_TOTAL_OVERFLOW: "Total kombinasi harga melampaui batas yang didukung.", INVALID_MEDIA_GRAPH: "Periksa referensi media produk.",
  INVALID_SORT: "Periksa urutan tampil.", INVALID_TEXT: "Periksa nama dan deskripsi." };
const CatalogEditor = ({ initial, role }) => {
  const [publicationTime, setPublicationTime] = useState("");
  const [graph, setGraph] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [pending, setPending] = useState({}), [newItems, setNewItems] = useState({}), [media, setMedia] = useState({}), [created, setCreated] = useState([]), [changes, setChanges] = useState({}), [preview, setPreview] = useState(false), [readiness, setReadiness] = useState(null);
  const unsaved = Object.keys(pending).length > 0 || Object.keys(newItems).length > 0 || created.length > 0 || Object.values(media).some(rows => rows.length), revision = graph.revision;
  const issueName = issue => [...graph.categories, ...graph.products, ...graph.productVariants, ...graph.modifierGroups, ...graph.modifierOptions]
    .find(row => row.id === issue.entityId)?.slug ?? [...graph.productVariants, ...graph.modifierGroups, ...graph.modifierOptions].find(row => row.id === issue.entityId)?.code ?? "Katalog";
  useEffect(() => {
    if (!unsaved) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const saveAll = async () => {
    setBusy(true); setMessage("");
    try {
      let staged = graph; const additional = [];
      for (const item of Object.values(newItems)) {
        const missing = item.required.filter(field => item.data[field.name] === "" || item.data[field.name] == null);
        if (missing.length) throw new Error("Lengkapi: " + missing.map(field => field.label).join(", ") + ". Perubahan belum disimpan.");
        const result = addCatalogItem(staged, item.action, item.data); staged = result.graph; additional.push(...result.operations);
      }
      const operations = [...created, ...additional, ...Object.values(pending), ...Object.values(media).flat()];
      const next = await catalogRequest('/' + revision.id, { action: "saveAll", data: { revisionId: revision.id, expectedVersion: revision.version, operations } }, "PATCH");
      setGraph(next); setPending({}); setNewItems({}); setCreated([]); setMedia({}); setChanges({}); setReadiness(null); setMessage("Semua perubahan tersimpan.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const checkReadiness = async action => {
    if (!["submit", "approve"].includes(action) || revision.status !== "draft") return true;
    setBusy(true); setMessage("");
    try {
      const result = await catalogRequest('/' + revision.id + '/actions', { action: "readiness", data: { revisionId: revision.id, expectedVersion: revision.version } });
      setReadiness(result); if (!result.ready) setMessage("Lengkapi isian wajib berikut sebelum melanjutkan."); return result.ready;
    } catch (error) { setMessage(error.message); return false; } finally { setBusy(false); }
  };
  const previewGraph = { ...graph };
  for (const change of Object.values(changes)) {
    const matches = row => Object.entries(change.match).every(([key, value]) => row[key] === value);
    const rows = previewGraph[change.table];
    previewGraph[change.table] = rows.some(matches) ? rows.map(row => matches(row) ? { ...row, ...change.values } : row) :
      [...rows, { revisionId: revision.id, ...change.create, ...change.values }];
  }
  const context = { disabled: busy || revision.status !== "draft",
    stage: (id, operation, overlay) => { setPending(previous => ({ ...previous, [id]: operation })); if (overlay) setChanges(previous => ({ ...previous, [id]: overlay })); setMessage(""); },
    stageNew: (id, item) => setNewItems(previous => { const next = { ...previous }; if (item) next[id] = item; else delete next[id]; return next; }),
    stageMedia: (id, operations) => setMedia(previous => ({ ...previous, [id]: operations })),
    add: (action, data) => { const result = addCatalogItem(graph, action, data); setGraph(result.graph); setCreated(previous => [...previous, ...result.operations]); setMessage("Item ditambahkan ke draft lokal. Klik Simpan semua perubahan untuk menyimpannya."); },
  };
  return <CatalogContext.Provider value={context}><div className="cms-editor grid gap-6">
    <Card className="shadow-none"><CardHeader><div className="flex flex-wrap gap-3"><RevisionStatus status={revision.status} /><Badge variant="outline">Versi: {revision.version}</Badge>
      {graph.isLive && <Badge>Sedang tampil di publik</Badge>}</div><CardDescription>Kategori, produk, varian, dan modifier disimpan dalam satu revisi katalog. Isi sekali dalam bahasa Indonesia. Tanda * wajib diisi.</CardDescription></CardHeader>
      <CardContent className="grid gap-6">{revision.status !== "draft" && <p className="rounded-lg bg-secondary p-4">Revisi ini dibekukan. Buat draft dari revisi ini untuk mengubah konten.</p>}
        <div className="cms-button-row"><Button variant="outline" onClick={() => setPreview(!preview)}>{preview ? "Kembali ke editor" : "Pratinjau katalog"}</Button>
</div>

      </CardContent></Card>
    {preview && <CatalogPreview graph={previewGraph} locale="id" unsaved={unsaved} />}
    <div key={revision.version} hidden={preview} className="space-y-6">
      <Card className="shadow-none"><CardHeader><h2>Kategori</h2><CardDescription>Slug tetap menjadi identitas kategori. Atur nama dan urutan tampil.</CardDescription></CardHeader><CardContent className="grid min-w-0 gap-6">
        {[...graph.categoryEntries].sort((a, b) => a.sortOrder - b.sortOrder).map(entry => {
          const category = graph.categories.find(row => row.id === entry.categoryId);
          return <details key={category.id} className="min-w-0 rounded-lg border p-4"><summary className="cursor-pointer break-all font-medium">{graph.categoryTranslations.find(row => row.categoryId === category.id && row.locale === "id")?.title || category.slug}</summary><div className="mt-6"><CategoryForm category={category} graph={graph} /></div></details>;
        })}
        <CatalogForm title="Tambah kategori" action="categoryCreate" initial={{ title: "", sortOrder: 0 }} fields={[{ name: "title", label: "Nama kategori" }]} reset button="Tambah kategori" />
      </CardContent></Card>
      <Card className="shadow-none"><CardHeader><h2>Produk</h2><CardDescription>Harga berupa rupiah bulat. Penambahan produk, varian, dan modifier tersimpan sebagai draft.</CardDescription></CardHeader><CardContent className="grid min-w-0 gap-6">
        {[...graph.productEntries].sort((a, b) => a.sortOrder - b.sortOrder).map(entry => {
          const product = graph.products.find(row => row.id === entry.productId);
          return <details key={product.id} className="min-w-0 rounded-lg border p-4"><summary className="cursor-pointer break-all font-medium">{graph.productTranslations.find(row => row.productId === product.id && row.locale === "id")?.title || product.slug}</summary><div className="mt-6"><ProductForm product={product} graph={graph} /></div></details>;
        })}
        {graph.categories.length ? <CatalogForm title="Tambah produk" action="productCreate" initial={{ title: "", categoryId: "", basePrice: 0, sortOrder: 0 }} reset button="Tambah produk"
          fields={[{ name: "title", label: "Nama produk" }, { name: "basePrice", label: "Harga (Rp)", type: "number", max: Number.MAX_SAFE_INTEGER }, { name: "categoryId", label: "Kategori produk", options: [{ value: "", label: "Pilih kategori" }, ...graph.categories.map(row => ({ value: row.id, label: row.slug }))] }]} /> : <p className="text-sm text-muted-foreground">Tambahkan kategori sebelum membuat produk.</p>}
      </CardContent></Card>
    </div>
    <SchedulePanel domain="catalog" revision={revision} role={role} disabled={busy || unsaved} time={publicationTime} onTimeChange={setPublicationTime} />
    <CatalogActions graph={graph} role={role} busy={busy} disabled={unsaved} onBusy={setBusy} onChange={next => { setGraph(next); setChanges({}); setReadiness(null); }} onMessage={setMessage}
      beforeAction={checkReadiness} dueAt={publicationTime || undefined} feedback={<div className="space-y-4"><p role="status" aria-live="polite">{message || (unsaved ? "Ada perubahan belum disimpan." : "Semua perubahan sudah tersimpan.")}</p>        {readiness && <div className="rounded-lg border p-4"><h2>{readiness.ready ? "Katalog siap diajukan" : "Katalog belum lengkap"}</h2><p className="mt-2 text-xs text-muted-foreground">Hasil untuk versi {readiness.version}. Pemeriksaan struktur belum memverifikasi fakta restoran atau harga platform.</p>
          {!!readiness.issues.length && <ul className="mt-3 grid gap-2">{readiness.issues.map((issue, index) => <li key={index} className="break-words text-sm"><strong>{issueName(issue)}{issue.locale ? ` (${issue.locale === "id" ? "Indonesia" : "Inggris"})` : ""}:</strong> {issueLabels[issue.code] ?? "Periksa kelengkapan dan keterkaitan isian katalog."}</li>)}</ul>}</div>}
</div>}>
      {revision.status === "draft" && <Button disabled={busy || !unsaved} onClick={saveAll}>{busy ? "Menyimpan..." : "Simpan semua perubahan"}</Button>}
    </CatalogActions>
  </div></CatalogContext.Provider>;
};
export default CatalogEditor;
