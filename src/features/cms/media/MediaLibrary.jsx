"use client";
import { useRef, useState } from "react";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import MediaView from "./MediaView";
import { mediaRequest } from "./client";
const MediaLibrary = ({ initial }) => {
  const [result, setResult] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [posterId, setPoster] = useState(""), [videoId, setVideo] = useState("");
  const file = useRef(null);
  const act = async operation => {
    setBusy(true); setMessage("");
    try { const row = await operation(); setResult(await mediaRequest()); setMessage("Media tersimpan. Pasang pada draft halaman atau produk untuk menerbitkannya."); return row; }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <div className="grid gap-6">
    <Card className="shadow-none"><CardHeader><h2>Upload media</h2><CardDescription>Gambar JPEG, PNG, WebP maksimal 10 MB dan 4096 piksel per sisi. Video MP4/WebM maksimal 100 MB, 120 detik, dan 1920 × 1080 piksel. File asli disimpan utuh.</CardDescription></CardHeader>
      <CardContent className="grid gap-6"><form className="grid gap-6" onSubmit={event => {
        event.preventDefault(); const selected = file.current?.files?.[0]; if (!selected) return;
        if (selected.size > (selected.type.startsWith("image/") ? 10000000 : 100000000)) { setMessage("Ukuran file melampaui batas."); return; }
        act(() => mediaRequest("/upload" + (selected.type.startsWith("video/") ? "?posterId=" + encodeURIComponent(posterId) : ""), selected, "POST", true)).then(row => { if (row) file.current.value = ""; });
      }}><div className="cms-form-field"><Label htmlFor="media-file">File media</Label><Input ref={file} id="media-file" type="file" required disabled={busy}
          accept={result.videoReady ? "image/jpeg,image/png,image/webp,video/mp4,video/webm" : "image/jpeg,image/png,image/webp"} /></div>
        <div className="cms-form-field"><Label htmlFor="media-poster">Poster video / YouTube</Label><NativeSelect id="media-poster" value={posterId} onChange={event => setPoster(event.target.value)} disabled={busy}>
          <NativeSelectOption value="">Pilih gambar poster</NativeSelectOption>{result.rows.filter(row => row.kind === "image").map(row => <NativeSelectOption key={row.id} value={row.id}>{row.id.slice(0, 8)} · {row.width} × {row.height}</NativeSelectOption>)}
        </NativeSelect></div><div className="cms-button-row"><Button disabled={busy}>Upload file</Button></div>
      </form>
      {!result.videoReady && <p className="text-sm text-muted-foreground">Upload video belum aktif: operator perlu mengonfigurasi FFmpeg dan ffprobe. Gambar dan YouTube dengan poster tetap dapat digunakan.</p>}
      <form className="grid gap-6 border-t pt-6" onSubmit={event => { event.preventDefault(); act(() => mediaRequest("", { videoId, posterId }, "POST")).then(row => { if (row) setVideo(""); }); }}>
        <div className="cms-form-field"><Label htmlFor="youtube-id">ID video YouTube</Label><Input id="youtube-id" value={videoId} pattern="[a-zA-Z0-9_-]{11}" maxLength={11} required disabled={busy} onChange={event => setVideo(event.target.value)} aria-describedby="youtube-help" />
          <p id="youtube-help" className="text-xs text-muted-foreground">Masukkan 11 karakter ID, bukan URL. Pilih poster di atas. Video hanya dimuat setelah persetujuan pengunjung.</p></div>
        <div className="cms-button-row"><Button variant="outline" disabled={busy || !posterId}>Tambahkan YouTube</Button></div>
      </form></CardContent></Card>
    <p role="status" aria-live="polite">{message}</p>
    <section aria-label="Daftar media" className="grid items-start gap-6 sm:grid-cols-2 xl:grid-cols-3">{result.rows.map(asset => <Card key={asset.id} className="min-w-0 overflow-hidden shadow-none">
      <CardHeader><h2 className="break-all text-base">Media {asset.id.slice(0, 8)}</h2><Badge variant="outline">{asset.kind}</Badge></CardHeader><CardContent className="grid gap-4">
        <MediaView asset={asset} alt={`Media ${asset.id.slice(0, 8)}`} /><p className="break-all text-xs text-muted-foreground">{asset.id}</p>
        {asset.byteSize && <p className="text-sm">{asset.width} × {asset.height} · {new Intl.NumberFormat("id-ID").format(asset.byteSize)} byte</p>}
      </CardContent></Card>)}</section>
    {!result.rows.length && <p>Belum ada media. Unggah gambar pertama Anda.</p>}
    {result.nextOffset !== null && <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); try { const more = await mediaRequest("?offset=" + result.nextOffset); setResult(previous => ({ ...more, rows: [...previous.rows, ...more.rows] })); }
      catch (error) { setMessage(error.message); } finally { setBusy(false); }
    }}>Muat media berikutnya</Button>}
  </div>;
};
export default MediaLibrary;
