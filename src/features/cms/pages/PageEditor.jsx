"use client";
import { useEffect, useState } from "react";
import { pageTemplateFields, pageDefinitions } from "@/server/pages/templates.mjs";
import RichTextEditor, { RichPreview } from "./RichTextEditor";
import RevisionActions from "./RevisionActions";
import { cmsRequest } from "./client";
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
    <p>Status: <strong>{revision.status}</strong> · Versi: {revision.version}{revision.isLive ? " · Sedang tampil di publik" : ""}</p>
    <p>Konten Indonesia dan Inggris wajib lengkap sebelum dikirim untuk review. Simpan setiap bahasa secara terpisah.</p>
    {revision.status !== "draft" && <p>Revisi ini dibekukan. Buat draft dari revisi ini untuk mengubah konten.</p>}
    <label>Bahasa konten<select value={locale} disabled={busy} onChange={event => setLocale(event.target.value)}>
      <option value="id">Indonesia</option><option value="en">Inggris</option></select></label>
    <p role="status" aria-live="polite">{message || (unsaved ? "Ada perubahan belum disimpan." : "")}</p>
    <button type="button" onClick={() => setPreview(!preview)}>{preview ? "Kembali ke editor" : "Pratinjau konten"}</button>
    {preview ? <section className="cms-preview" lang={locale} aria-label="Pratinjau konten"><h2>Pratinjau konten</h2>
      <p>Pratinjau isi kolom; susunan halaman publik mengikuti template tetap.</p>
      {Object.entries(spec).map(([key, type]) => <section key={key}><h3>{labels[key]}</h3>
        {type === "rich" ? <RichPreview document={fields[locale][key] ?? { blocks: [] }} /> : <p>{fields[locale][key] ?? ""}</p>}</section>)}
    </section> : <form className="auth-form" onSubmit={save} lang={locale}>
      <fieldset disabled={busy || revision.status !== "draft"} className="cms-fields"><legend>Konten {locale === "id" ? "Indonesia" : "Inggris"}</legend>
        {Object.entries(spec).map(([key, type]) => type === "rich" ? <RichTextEditor key={key} label={labels[key]} value={fields[locale][key] ?? { blocks: [] }}
          disabled={busy || revision.status !== "draft"} onChange={value => change(key, value)} /> : <div key={key}>
          <label htmlFor={`cms-${locale}-${key}`}>{labels[key]}</label>
          <textarea id={`cms-${locale}-${key}`} value={fields[locale][key] ?? ""} maxLength={type === "short" ? 160 : type === "title" ? 240 : 2000} onChange={event => change(key, event.target.value)} />
        </div>)}
        <button type="submit" disabled={!dirty[locale]}>Simpan draft {locale === "id" ? "Indonesia" : "Inggris"}</button>
      </fieldset>
    </form>}
    <RevisionActions revision={revision} role={role} disabled={busy || unsaved} onMessage={setMessage} onBusy={setBusy}
      onChange={row => setRevision(previous => ({ ...previous, ...row, isLive: row.status === "published" || previous.isLive }))} />
  </div>;
};
export default PageEditor;
