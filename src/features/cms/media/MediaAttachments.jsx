"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { mediaRequest } from "./client";
const MediaAttachments = ({ productId = null, initial = [], assets = [], disabled, onOperations, saveLabel = "Simpan semua perubahan" }) => {
  const [rows, setRows] = useState(() => initial.filter(row => !productId || row.productId === productId).map(row => ({ ...row, key: row.id, referenceId: row.id })));
  const [library, setLibrary] = useState(assets), [message, setMessage] = useState("");
  useEffect(() => { let active = true; mediaRequest().then(data => { if (active) setLibrary(previous => [...new Map([...previous, ...data.rows].map(a => [a.id, a])).values()]); }).catch(() => { if (active) setMessage("Pustaka media belum dapat dimuat."); }); return () => { active = false; }; }, []);
  const update = next => {
    setRows(next);
    onOperations(next.filter(row => row.changed).map(row => ({
      action: row.removed ? "mediaRemove" : "mediaSave", data: { ...(productId ? { productId } : {}), referenceId: row.referenceId,
        ...(row.removed ? {} : Object.fromEntries(["assetId", "altId", "altEn", "captionId", "captionEn", "sortOrder"].map(key => [key, row[key]]))) },
    })));
  };
  const change = (key, field, value) => update(rows.map(row => row.key === key ? { ...row, [field]: value, changed: true } : row));
  return <section className="grid gap-4" aria-label="Media konten"><div className="flex flex-wrap items-center justify-between gap-3"><h3>Gambar dan video (opsional)</h3><Button asChild variant="outline"><Link href="/admin/media" target="_blank" rel="noopener">Buka pustaka media</Link></Button></div>
    <p className="text-sm text-muted-foreground">Pemasangan dan pelepasan media ikut disimpan melalui tombol {saveLabel}.</p>{message && <p>{message}</p>}
    {rows.filter(row => !row.removed).map(row => <fieldset key={row.key} disabled={disabled} className="grid gap-4 rounded-lg border p-4"><legend className="px-2 text-sm">Media</legend>
      <div className="cms-form-field"><Label htmlFor={row.key + "asset"}>Pilih media</Label><NativeSelect id={row.key + "asset"} value={row.assetId} onChange={event => change(row.key, "assetId", event.target.value)}><NativeSelectOption value="">Pilih media</NativeSelectOption>{library.map(asset => <NativeSelectOption key={asset.id} value={asset.id}>{asset.kind} {asset.id.slice(0, 8)}</NativeSelectOption>)}</NativeSelect></div>
      <div className="cms-form-field"><Label htmlFor={row.key + "alt"}>Deskripsi gambar * (wajib)</Label><Input id={row.key + "alt"} value={row.altId} maxLength={500} onChange={event => change(row.key, "altId", event.target.value)} /></div>
      <div className="cms-form-field"><Label htmlFor={row.key + "caption"}>Keterangan (opsional)</Label><Textarea id={row.key + "caption"} value={row.captionId} maxLength={2000} onChange={event => change(row.key, "captionId", event.target.value)} /></div>
      <Button type="button" variant="outline" className="justify-self-start" onClick={() => update(row.referenceId ? rows.map(item => item.key === row.key ? { ...item, removed: true, changed: true } : item) : rows.filter(item => item.key !== row.key))}>Lepas media</Button>
    </fieldset>)}
    <Button type="button" variant="outline" className="justify-self-start" disabled={disabled || rows.filter(row => !row.removed).length >= 12} onClick={() => update([...rows, { key: crypto.randomUUID(), referenceId: null, assetId: "", altId: "", altEn: "", captionId: "", captionEn: "", sortOrder: rows.length }])}>Tambah media</Button>
  </section>;
};
export default MediaAttachments;
