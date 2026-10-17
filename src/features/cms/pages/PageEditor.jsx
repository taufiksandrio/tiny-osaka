"use client";
import { useEffect, useRef, useState } from "react";
import { pageTemplateFields, pageDefinitions } from "@/server/pages/templates.mjs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import RevisionActions from "./RevisionActions";
import RevisionStatus from "./RevisionStatus";
import PagePreview from "./PagePreview";
import RichTextEditor from "./RichTextEditor";
import MediaAttachments from "../media/MediaAttachments";
import { SchedulePanel } from "../publishing/Publications";
import { cmsRequest } from "./client";
import { homeDraft } from "@/features/public-site/home-draft.mjs";
const labels = { title: "Judul", summary: "Ringkasan", body: "Isi", eyebrow: "Pengantar", seoTitle: "Judul SEO", seoDescription: "Deskripsi SEO",
  menuTitle: "Judul menu", menuIntro: "Pengantar menu", aboutTitle: "Judul tentang", aboutBody: "Isi tentang", primaryCtaLabel: "Label tombol utama", secondaryCtaLabel: "Label tombol kedua",
  storyHeading: "Judul cerita", storyBody: "Isi cerita", serviceHeading: "Judul layanan", serviceBody: "Isi layanan", city: "Kota", service: "Layanan", hours: "Jam", coverage: "Cakupan" };
const textOf = value => (value?.blocks ?? []).map(block => (block.content ?? block.items?.flat() ?? []).map(span => span.text).join("")).join("\n\n");
const documentOf = text => ({ blocks: text.split(/\n\s*\n/).filter(part => part.trim()).map(part => ({ type: "paragraph", content: (part.match(/[\s\S]{1,4000}/g) ?? []).map(text => ({ text })) })) });
const PageEditor = ({ initial, role }) => {
  const [publicationTime, setPublicationTime] = useState("");
  const [revision, setRevision] = useState(initial), [fields, setFields] = useState(initial.translations.find(row => row.locale === "id")?.fields ?? {});
  const [dirty, setDirty] = useState(false), [media, setMedia] = useState([]), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [issues, setIssues] = useState([]), [preview, setPreview] = useState(false);
  const form = useRef(null), unsaved = dirty || media.length > 0, frozen = revision.status !== "draft";
  useEffect(() => { if (!unsaved) return; const warn = event => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [unsaved]);
  const spec = pageTemplateFields[pageDefinitions[initial.pageKey].template];
  const change = (key, value) => { setFields(previous => ({ ...previous, [key]: value })); setDirty(true); setMessage(""); setIssues([]); };
  const save = async () => {
    setBusy(true); setMessage(""); setIssues([]);
    const nextFields = { ...fields, seoTitle: fields.seoTitle?.trim() || fields.title || "", seoDescription: fields.seoDescription?.trim() || fields.summary || textOf(fields.body).slice(0, 300) };
    try {
      const next = await cmsRequest('/' + revision.id, { revisionId: revision.id, expectedVersion: revision.version,
        operations: [{ action: "save", data: { locale: "id", fields: nextFields } }, ...media] }, "PATCH");
      setRevision(next); setFields(nextFields); setDirty(false); setMedia([]); setMessage("Semua perubahan tersimpan.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const beforeAction = action => {
    if (!["submit", "approve"].includes(action)) return true;
    const missing = [!fields.title?.trim() && "Judul wajib diisi.", !textOf(fields.body).trim() && "Isi halaman wajib diisi.",
      revision.mediaRefs?.some(row => !row.altId?.trim()) && "Deskripsi gambar wajib diisi untuk media yang dipasang."].filter(Boolean);
    setIssues(missing);
    if (!missing.length) return true;
    setPreview(false); setMessage("Lengkapi isian wajib sebelum melanjutkan.");
    setTimeout(() => form.current?.querySelector(!fields.title?.trim() ? '#page-title' : !textOf(fields.body).trim() ? '#page-body' : 'input[id$=alt]')?.focus(), 0); return false;
  };
  return <div ref={form} className="cms-editor grid gap-6">
    <Card className="shadow-none"><CardHeader><div className="flex flex-wrap gap-3"><RevisionStatus status={revision.status} /><span>Versi {revision.version}</span>{revision.isLive && <span>Sedang tampil di publik</span>}</div>
      <CardDescription>Isi dalam bahasa Indonesia. Tanda * wajib dilengkapi sebelum disetujui atau dikirim untuk review. Draft boleh disimpan bertahap.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" onClick={() => setPreview(!preview)}>{preview ? "Kembali ke editor" : "Pratinjau konten"}</Button>
      {revision.pageKey === "home" && !frozen && <Button variant="outline" disabled={busy} onClick={() => { setFields(previous => ({ ...homeDraft.id, ...Object.fromEntries(Object.entries(previous).filter(([, value]) => typeof value === "string" ? value.trim() : textOf(value).trim())) })); setDirty(true); setMessage("Draf home dimuat. Periksa lalu simpan semua perubahan."); }}>Muat draf konten home</Button>}
    </CardContent></Card>
    {preview ? <PagePreview spec={spec} fields={fields} locale="id" labels={labels} unsaved={unsaved} pageKey={revision.pageKey} mediaRefs={revision.mediaRefs} mediaAssets={revision.mediaAssets} /> : <div className="grid gap-6">
      {frozen && <p className="rounded-lg bg-secondary p-4">Revisi dibekukan. Buat draft dari revisi ini untuk mengubah konten.</p>}
      <Card className="shadow-none"><CardHeader><h2>Konten halaman</h2></CardHeader><CardContent><fieldset disabled={busy || frozen} className="grid gap-6">
        <div className="cms-form-field"><Label htmlFor="page-title">Judul * (wajib)</Label><Input id="page-title" required maxLength={240} value={fields.title ?? ""} onChange={event => change("title", event.target.value)} /></div>
        <div className="cms-form-field"><Label htmlFor="page-summary">Ringkasan (opsional)</Label><Textarea id="page-summary" maxLength={2000} value={fields.summary ?? ""} onChange={event => change("summary", event.target.value)} /></div>
        <div className="cms-form-field"><Label htmlFor="page-body">Isi * (wajib)</Label><Textarea id="page-body" required className="min-h-60" value={textOf(fields.body)} onChange={event => change("body", documentOf(event.target.value))} /><p className="text-xs text-muted-foreground">Pisahkan paragraf dengan baris kosong.</p></div>
        <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Pengaturan tambahan (opsional)</summary><div className="mt-6 grid gap-6">
          <RichTextEditor label="Pemformatan isi" value={fields.body ?? { blocks: [] }} disabled={busy || frozen} onChange={value => change("body", value)} />
          {Object.entries(spec).filter(([key]) => !["title", "summary", "body"].includes(key)).map(([key, type]) => type === "rich" ?
            <RichTextEditor key={key} label={labels[key] + " (opsional)"} value={fields[key] ?? { blocks: [] }} disabled={busy || frozen} onChange={value => change(key, value)} /> :
            <div className="cms-form-field" key={key}><Label htmlFor={'page-' + key}>{labels[key]} (opsional)</Label><Input id={'page-' + key} value={fields[key] ?? ""} maxLength={type === "short" ? 160 : type === "title" ? 240 : 2000} onChange={event => change(key, event.target.value)} /></div>)}
        </div></details>
      </fieldset></CardContent></Card>
    </div>}
    <Card className="shadow-none"><CardContent><MediaAttachments key={revision.version} initial={revision.mediaRefs} assets={revision.mediaAssets} disabled={busy || frozen} onOperations={setMedia} /></CardContent></Card>
    <SchedulePanel domain="page" revision={revision} role={role} disabled={busy || unsaved} time={publicationTime} onTimeChange={setPublicationTime} />
    <RevisionActions revision={revision} role={role} disabled={busy || unsaved} onBusy={setBusy} beforeAction={beforeAction} dueAt={publicationTime || undefined} onMessage={setMessage}
      onChange={row => setRevision(previous => ({ ...previous, ...row, isLive: row.status === "published" || previous.isLive }))}
      feedback={<div className="space-y-3"><p role="status" aria-live="polite">{message || (unsaved ? "Ada perubahan belum disimpan." : "Semua perubahan sudah tersimpan.")}</p>{issues.length > 0 && <ul className="list-disc pl-5 text-destructive">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div>}>
      {!frozen && <Button type="button" disabled={busy || !unsaved} onClick={save}>{busy ? "Menyimpan..." : "Simpan semua perubahan"}</Button>}
    </RevisionActions>
  </div>;
};
export default PageEditor;
