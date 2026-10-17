import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RichPreview } from "./RichTextEditor";
const PagePreview = ({ spec, fields, locale, labels, unsaved }) => <section aria-label="Pratinjau konten" lang={locale} className="cms-page-preview grid gap-6">
  <Card className="shadow-none"><CardHeader><div className="flex flex-wrap items-center gap-3"><h2>Pratinjau konten</h2><Badge variant="secondary">{locale === "id" ? "Indonesia" : "Inggris"}</Badge><Badge variant="outline">{unsaved ? "Belum disimpan" : "Revisi tersimpan"}</Badge></div>
    <CardDescription>Pratinjau isi kolom. Susunan website publik mengikuti template halaman tetap.</CardDescription></CardHeader>
    <CardContent className="space-y-4"><p className="text-sm font-medium text-primary">{fields.eyebrow || "Pengantar belum diisi"}</p><h3 className="break-words text-2xl">{fields.title || "Judul belum diisi"}</h3><p className="whitespace-pre-wrap break-words text-muted-foreground">{fields.summary || "Ringkasan belum diisi"}</p></CardContent></Card>
  <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><div className="grid min-w-0 gap-6">{Object.entries(spec).filter(([key]) => !["eyebrow", "title", "summary"].includes(key) && !key.startsWith("seo")).map(([key, type]) =>
    <Card key={key} className="min-w-0 shadow-none"><CardHeader><h3>{labels[key]}</h3></CardHeader><CardContent className="cms-preview-body break-words">
      {type === "rich" ? fields[key]?.blocks?.length ? <RichPreview document={fields[key]} /> : <p className="text-muted-foreground">Konten belum diisi.</p> : <p className="whitespace-pre-wrap">{fields[key] || "Belum diisi"}</p>}
    </CardContent></Card>)}</div>
    <Card className="min-w-0 shadow-none"><CardHeader><h3>Metadata SEO</h3><CardDescription>Preview metadata dari kolom yang diisi; tampilan mesin pencari dapat berbeda.</CardDescription></CardHeader><CardContent className="grid gap-4 break-words">
      <p className="text-lg font-medium">{fields.seoTitle || "Judul SEO belum diisi"}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{fields.seoDescription || "Deskripsi SEO belum diisi"}</p>
    </CardContent></Card></div>
</section>;
export default PagePreview;
