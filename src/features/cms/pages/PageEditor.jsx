"use client";
import { useEffect, useState } from "react";
import { pageTemplateFields, pageDefinitions } from "@/server/pages/templates.mjs";
import RichTextEditor from "./RichTextEditor";
import PagePreview from "./PagePreview";
import RevisionActions from "./RevisionActions";
import { cmsRequest } from "./client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Eye, Save, LoaderCircle, Languages, LockKeyhole } from "lucide-react";
import RevisionStatus from "./RevisionStatus";
const labels = { eyebrow: "Pengantar", title: "Judul", summary: "Ringkasan", seoTitle: "Judul SEO", seoDescription: "Deskripsi SEO", body: "Isi",
  menuTitle: "Judul menu", menuIntro: "Pengantar menu", aboutTitle: "Judul tentang", aboutBody: "Isi tentang", primaryCtaLabel: "Label tombol utama",
  secondaryCtaLabel: "Label tombol kedua", storyHeading: "Judul cerita", storyBody: "Isi cerita", serviceHeading: "Judul layanan", serviceBody: "Isi layanan",
  city: "Kota", service: "Layanan", hours: "Jam", coverage: "Cakupan" };
const fieldHelp = { eyebrow: "Pengantar singkat di atas judul halaman.", title: "Judul utama yang tampil di website.",
  summary: "Ringkasan yang memperkenalkan isi halaman.", seoTitle: "Judul metadata halaman.",
  seoDescription: "Deskripsi metadata halaman.", primaryCtaLabel: "Teks tombol utama. Tujuan tautan mengikuti template.",
  secondaryCtaLabel: "Teks tombol kedua. Tujuan tautan mengikuti template." };
const mainFields = ["eyebrow", "title", "summary", "body"];
const isSeo = name => name.startsWith("seo");
const isCta = name => name.endsWith("CtaLabel");
const PageEditor = ({ initial, role }) => {
  const [revision, setRevision] = useState(initial), [locale, setLocale] = useState("id"), [fields, setFields] = useState(() =>
    Object.fromEntries(["id", "en"].map(language => [language, initial.translations.find(row => row.locale === language)?.fields ?? {}])));
  const [dirty, setDirty] = useState({ id: false, en: false }), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const unsaved = dirty.id || dirty.en;
  useEffect(() => {
    if (!unsaved) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const spec = pageTemplateFields[pageDefinitions[initial.pageKey].template];
  const groups = [
    { key: "main", title: "Konten utama", description: "Judul, pengantar, dan isi utama halaman.", match: name => mainFields.includes(name) },
    { key: "sections", title: "Bagian halaman", description: "Konten tambahan sesuai template halaman ini.", match: name => !mainFields.includes(name) && !isSeo(name) && !isCta(name) },
    { key: "seo", title: "Metadata SEO", description: "Lengkapi judul dan deskripsi metadata dalam bahasa yang sedang dipilih.", match: isSeo },
    { key: "cta", title: "Tombol dan CTA", description: "Sesuaikan teks tombol. Tujuan tautan tetap mengikuti template website.", match: isCta },
  ].map(group => ({ ...group, entries: Object.entries(spec).filter(([name]) => group.match(name)) })).filter(group => group.entries.length);
  const change = (key, value) => {
    setFields(previous => ({ ...previous, [locale]: { ...previous[locale], [key]: value } }));
    setDirty(previous => ({ ...previous, [locale]: true })); setMessage("");
  };
  const save = async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const row = await cmsRequest(`/${revision.id}`, { revisionId: revision.id, expectedVersion: revision.version, locale, fields: fields[locale] }, "PATCH");
      setRevision(previous => ({ ...previous, ...row })); setDirty(previous => ({ ...previous, [locale]: false }));
      setMessage("Draft " + (locale === "id" ? "Indonesia" : "Inggris") + " tersimpan.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <div className="cms-editor">
    <Card className="gap-4 shadow-none"><CardHeader><div className="flex flex-wrap items-center gap-3"><RevisionStatus status={revision.status} />
        <Badge variant="outline">Versi: {revision.version}</Badge>{revision.isLive && <span className="text-sm text-primary">Sedang tampil di publik</span>}</div>
      <CardDescription>Konten Indonesia dan Inggris wajib lengkap sebelum dikirim untuk review. Simpan setiap bahasa secara terpisah.</CardDescription>
    </CardHeader><CardContent className="space-y-4">
      {revision.status !== "draft" && <p className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm"><LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Revisi ini dibekukan. Buat draft dari revisi ini untuk mengubah konten.</p>}
      <div className="flex flex-wrap items-end justify-between gap-4"><div className="cms-form-field"><Label htmlFor="content-locale">Bahasa konten</Label>
        <NativeSelect id="content-locale" value={locale} disabled={busy} onChange={event => setLocale(event.target.value)}>
          <NativeSelectOption value="id">Indonesia</NativeSelectOption><NativeSelectOption value="en">Inggris</NativeSelectOption>
        </NativeSelect></div>
        <Button type="button" variant="outline" onClick={() => setPreview(!preview)}><Eye aria-hidden="true" />{preview ? "Kembali ke editor" : "Pratinjau konten"}</Button>
      </div>
      <div className="flex flex-wrap gap-2">{["id", "en"].map(language => <Badge key={language} variant="outline">
        <Languages className="size-3" aria-hidden="true" />{language === "id" ? "Indonesia" : "Inggris"}: {dirty[language] ? "Belum disimpan" : "Tidak ada perubahan"}
      </Badge>)}</div>
      <p role="status" aria-live="polite" className="text-sm font-medium">{message || (unsaved ? "Ada perubahan belum disimpan." : "")}</p>
    </CardContent></Card>
    {preview ? <PagePreview spec={spec} fields={fields[locale]} locale={locale} labels={labels} unsaved={dirty[locale]} /> : <form onSubmit={save} lang={locale}>
      <fieldset disabled={busy || revision.status !== "draft"} className="cms-fields"><legend className="sr-only">Konten {locale === "id" ? "Indonesia" : "Inggris"}</legend>
        <div className="grid gap-6">{groups.map(group => <Card key={group.key} className="gap-5 shadow-none">
          <CardHeader><h2>{group.title}</h2><CardDescription>{group.description}</CardDescription></CardHeader>
          <CardContent className="grid min-w-0 gap-6">{group.entries.map(([key, type]) => {
            if (type === "rich") return <RichTextEditor key={key} label={labels[key]} value={fields[locale][key] ?? { blocks: [] }}
              disabled={busy || revision.status !== "draft"} onChange={value => change(key, value)} />;
            const Control = type === "summary" ? Textarea : Input;
            const limit = type === "short" ? 160 : type === "title" ? 240 : 2000;
            const id = `cms-${locale}-${key}`;
            return <div key={key} className="cms-form-field"><Label htmlFor={id}>{labels[key]}</Label>
              <Control id={id} value={fields[locale][key] ?? ""} maxLength={limit} aria-describedby={id + "-help"} onChange={event => change(key, event.target.value)} />
              <div id={id + "-help"} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>{fieldHelp[key] ?? `Isi ${labels[key].toLowerCase()} untuk bahasa yang dipilih.`}</span><span>{(fields[locale][key] ?? "").length}/{limit}</span>
              </div>
            </div>;
          })}</CardContent>
        </Card>)}</div>
        <div className="cms-save-bar"><p className="text-sm text-muted-foreground">{dirty[locale] ? "Perubahan bahasa ini belum disimpan." : "Tidak ada perubahan untuk disimpan."}</p>
          <Button type="submit" disabled={!dirty[locale]}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Simpan draft {locale === "id" ? "Indonesia" : "Inggris"}</Button>
        </div>
      </fieldset>
    </form>}
    <RevisionActions revision={revision} role={role} disabled={busy || unsaved} onMessage={setMessage} onBusy={setBusy}
      onChange={row => setRevision(previous => ({ ...previous, ...row, isLive: row.status === "published" || previous.isLive }))} />
  </div>;
};
export default PageEditor;
