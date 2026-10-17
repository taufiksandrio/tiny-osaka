"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import MediaView from "./MediaView";
import { mediaRequest } from "./client";
const blank = { assetId: "", referenceId: null, altId: "", altEn: "", captionId: "", captionEn: "", sortOrder: 0 };
const ReferenceForm = ({ item, assets, disabled, onSave, onRemove, onDirty }) => {
  const prefix = useId(), [fields, setFields] = useState(() => item ? Object.fromEntries(Object.keys(blank).map(key => [key, key === "referenceId" ? item.id : item[key]])) : { ...blank });
  const dirtyKey = item?.id || "new";
  const change = (key, value) => { setFields(previous => ({ ...previous, [key]: value })); onDirty(dirtyKey, true); };
  return <form className="grid gap-6 rounded-lg border p-4" onSubmit={async event => {
    event.preventDefault(); if (await onSave(fields)) { onDirty(dirtyKey, false); if (!item) setFields({ ...blank }); }
  }}><h3>{item ? "Media terpasang" : "Pasang media"}</h3>
    {item && <MediaView asset={item.asset} alt={fields.altId || "Pratinjau media"} />}
    <div className="cms-form-field"><Label htmlFor={prefix + "-asset"}>Pilih media</Label><NativeSelect id={prefix + "-asset"} value={fields.assetId} required disabled={disabled} onChange={event => change("assetId", event.target.value)}>
      <NativeSelectOption value="">Pilih media dari pustaka</NativeSelectOption>
      {[...(item && !assets.some(asset => asset.id === item.assetId) ? [item.asset] : []), ...assets].map(asset => <NativeSelectOption key={asset.id} value={asset.id}>{asset.id.slice(0, 8)} · {asset.kind}{asset.width ? ` · ${asset.width} × ${asset.height}` : ""}</NativeSelectOption>)}
    </NativeSelect></div>
    <div className="grid gap-6 md:grid-cols-2">{[["altId", "Alt Indonesia"], ["altEn", "Alt Inggris"], ["captionId", "Caption Indonesia"], ["captionEn", "Caption Inggris"]].map(([key, label]) => {
      const Control = key.startsWith("caption") ? Textarea : Input;
      return <div key={key} className="cms-form-field"><Label htmlFor={prefix + key}>{label}</Label><Control id={prefix + key} value={fields[key]} maxLength={key.startsWith("alt") ? 500 : 2000} disabled={disabled} onChange={event => change(key, event.target.value)} /></div>;
    })}</div><div className="cms-form-field"><Label htmlFor={prefix + "-order"}>Urutan media</Label><Input id={prefix + "-order"} type="number" min={0} max={2147483647} step={1} required value={fields.sortOrder} disabled={disabled} onChange={event => change("sortOrder", event.target.value === "" ? "" : Number(event.target.value))} /></div>
    <div className="cms-button-row"><Button disabled={disabled}>Simpan media</Button>{item && <Button type="button" variant="outline" disabled={disabled} onClick={async () => { if (await onRemove(item.id)) onDirty(dirtyKey, false); }}>Lepas media dari draft</Button>}</div>
  </form>;
};
const MediaAttachments = ({ domain, revisionId, version, productId = null, disabled, onChange, onBusy, onDirty }) => {
  const [items, setItems] = useState([]), [library, setLibrary] = useState(null), [message, setMessage] = useState("");
  const query = "?" + new URLSearchParams({ domain, revisionId, ...(productId ? { productId } : {}) });
  useEffect(() => {
    let active = true;
    Promise.all([mediaRequest("/references" + query), mediaRequest()]).then(([rows, assets]) => { if (active) { setItems(rows); setLibrary(assets); } })
      .catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [query]);
  const mutate = async (action, data) => {
    onBusy(true); setMessage("");
    try {
      const row = await mediaRequest("/references", { domain, action, data: { revisionId, expectedVersion: version, ...(productId ? { productId } : {}), ...data } }, "POST");
      setItems(await mediaRequest("/references" + query)); await onChange(row.version); setMessage("Media draft tersimpan."); return true;
    } catch (error) { setMessage(error.message); return false; } finally { onBusy(false); }
  };
  return <Card className="shadow-none"><CardHeader><h2>Media {domain === "page" ? "halaman" : "produk"}</h2><CardDescription>Alt Indonesia dan Inggris wajib lengkap sebelum review. Maksimal 12 lampiran. Melepas lampiran tidak menghapus file asli.</CardDescription></CardHeader>
    <CardContent className="grid gap-6"><Button asChild variant="outline" className="justify-self-start"><Link href="/admin/media">Buka pustaka media</Link></Button>
      <p aria-live="polite" className="text-sm">{message}</p>
      {items.map(item => <ReferenceForm key={item.id} item={item} assets={library?.rows || []} disabled={disabled} onDirty={onDirty} onSave={data => mutate("save", data)} onRemove={referenceId => mutate("remove", { referenceId })} />)}
      {library && items.length < 12 && <ReferenceForm assets={library.rows} disabled={disabled} onDirty={onDirty} onSave={data => mutate("save", data)} />}
      {library?.nextOffset !== null && library && <Button type="button" variant="outline" disabled={disabled} onClick={async () => {
        try { const more = await mediaRequest("?offset=" + library.nextOffset); setLibrary(previous => ({ ...more, rows: [...previous.rows, ...more.rows] })); }
        catch (error) { setMessage(error.message); }
      }}>Muat pilihan media berikutnya</Button>}
    </CardContent></Card>;
};
export default MediaAttachments;
