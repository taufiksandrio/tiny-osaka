"use client";
import { useEffect, useState } from "react";
import { pageTemplateFields, pageDefinitions } from "@/server/pages/templates.mjs";
import RichTextEditor, { RichPreview } from "./RichTextEditor";
import RevisionActions from "./RevisionActions";
import { cmsRequest } from "./client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Eye, Save, LoaderCircle } from "lucide-react";
const labels = { eyebrow: "Pengantar", title: "Judul", summary: "Ringkasan", seoTitle: "Judul SEO", seoDescription: "Deskripsi SEO", body: "Isi",
  menuTitle: "Judul menu", menuIntro: "Pengantar menu", aboutTitle: "Judul tentang", aboutBody: "Isi tentang", primaryCtaLabel: "Label tombol utama",
  secondaryCtaLabel: "Label tombol kedua", storyHeading: "Judul cerita", storyBody: "Isi cerita", serviceHeading: "Judul layanan", serviceBody: "Isi layanan",
  city: "Kota", service: "Layanan", hours: "Jam", coverage: "Cakupan" };
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
    <Card className="gap-3 shadow-none"><CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><p>Status: <Badge variant={revision.isLive ? "default" : "secondary"}>{revision.status}</Badge></p>
        <Badge variant="outline">Versi: {revision.version}</Badge>{revision.isLive && <span className="text-sm text-primary">Sedang tampil di publik</span>}</div>
      <p className="text-sm text-muted-foreground">Konten Indonesia dan Inggris wajib lengkap sebelum dikirim untuk review. Simpan setiap bahasa secara terpisah.</p>
      {revision.status !== "draft" && <p className="rounded-lg bg-secondary p-3 text-sm">Revisi ini dibekukan. Buat draft dari revisi ini untuk mengubah konten.</p>}
      <div className="flex flex-wrap items-end justify-between gap-4"><div className="grid gap-2"><Label htmlFor="content-locale">Bahasa konten</Label>
        <NativeSelect id="content-locale" value={locale} disabled={busy} onChange={event => setLocale(event.target.value)}>
          <NativeSelectOption value="id">Indonesia</NativeSelectOption><NativeSelectOption value="en">Inggris</NativeSelectOption>
        </NativeSelect></div>
        <Button type="button" variant="outline" onClick={() => setPreview(!preview)}><Eye aria-hidden="true" />{preview ? "Kembali ke editor" : "Pratinjau konten"}</Button>
      </div>
      <p role="status" aria-live="polite" className="text-sm font-medium">{message || (unsaved ? "Ada perubahan belum disimpan." : "")}</p>
    </CardContent></Card>
    {preview ? <section className="cms-preview" lang={locale} aria-label="Pratinjau konten"><h2>Pratinjau konten</h2>
      <p>Pratinjau isi kolom; susunan halaman publik mengikuti template tetap.</p>
      {Object.entries(spec).map(([key, type]) => <section key={key}><h3>{labels[key]}</h3>
        {type === "rich" ? <RichPreview document={fields[locale][key] ?? { blocks: [] }} /> : <p>{fields[locale][key] ?? ""}</p>}</section>)}
    </section> : <Card className="shadow-none"><CardContent><form className="grid gap-4" onSubmit={save} lang={locale}>
      <fieldset disabled={busy || revision.status !== "draft"} className="cms-fields"><legend>Konten {locale === "id" ? "Indonesia" : "Inggris"}</legend>
        {Object.entries(spec).map(([key, type]) => type === "rich" ? <RichTextEditor key={key} label={labels[key]} value={fields[locale][key] ?? { blocks: [] }}
          disabled={busy || revision.status !== "draft"} onChange={value => change(key, value)} /> : <div key={key}>
          <Label htmlFor={`cms-${locale}-${key}`}>{labels[key]}</Label>
          <Textarea id={`cms-${locale}-${key}`} value={fields[locale][key] ?? ""} maxLength={type === "short" ? 160 : type === "title" ? 240 : 2000} onChange={event => change(key, event.target.value)} />
        </div>)}
        <Button type="submit" className="justify-self-start" disabled={!dirty[locale]}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Simpan draft {locale === "id" ? "Indonesia" : "Inggris"}</Button>
      </fieldset>
    </form></CardContent></Card>}
    <RevisionActions revision={revision} role={role} disabled={busy || unsaved} onMessage={setMessage} onBusy={setBusy}
      onChange={row => setRevision(previous => ({ ...previous, ...row, isLive: row.status === "published" || previous.isLive }))} />
  </div>;
};
export default PageEditor;
