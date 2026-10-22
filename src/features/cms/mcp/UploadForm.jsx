"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const formatSize = bytes => bytes >= 1000000 ? `${(bytes / 1000000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
const PREVIEW_MAX_BYTES = 10 * 1000 * 1000;

// The page sends Referrer-Policy: no-referrer to keep the token out of Referer headers. With that policy the browser serializes
// a native form POST's Origin as "null", which the CMS Origin check rightly refuses. The upload therefore goes through fetch() with a
// per-request same-origin policy and no Referer (referrer: ""), so the browser sends the real Origin and no token URL leaves the page.
// Without JavaScript the plain form post still exists but is refused by the Origin check; the page needs JavaScript to upload.
const UploadForm = ({ action, target }) => {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const readId = useRef(0);
  // Preview through a data: URL (img-src allows data:); a blob: URL is not allowed by connect-src and would raise a CSP violation.
  const choose = event => {
    const picked = event.target.files?.[0] ?? null;
    const id = ++readId.current;
    setFile(picked); setPreview(""); setError("");
    if (!picked || !picked.type.startsWith("image/") || picked.size > PREVIEW_MAX_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => { if (readId.current === id && typeof reader.result === "string") setPreview(reader.result); };
    reader.readAsDataURL(picked);
  };
  const submit = async event => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(action, { method: "POST", body: form, headers: { Accept: "application/json" },
        credentials: "same-origin", referrerPolicy: "same-origin", referrer: "" });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { router.push(`${action.replace("/api/mcp/upload/", "/admin/mcp/upload/")}?r=ok`); return; }
      if (response.status !== 429 && typeof body.code === "string" && /^[A-Z_]+$/.test(body.code)) {
        router.push(`${action.replace("/api/mcp/upload/", "/admin/mcp/upload/")}?r=${encodeURIComponent(body.code)}`); return;
      }
      setError(response.status === 429 ? "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." : "Unggahan gagal. Coba lagi beberapa saat.");
    } catch {
      setError("Koneksi terputus. Periksa jaringan lalu coba lagi.");
    }
    setBusy(false);
  };
  return <form method="post" action={action} encType="multipart/form-data" className="grid gap-4" onSubmit={submit}>
    {target && <p className="text-sm text-muted-foreground">Untuk: <code>{target}</code></p>}
    <div className="grid gap-2">
      <Label htmlFor="upload-file">Foto</Label>
      <input id="upload-file" name="file" type="file" accept="image/*" required onChange={choose}
        className="min-h-11 w-full rounded-md border border-input bg-background p-2 text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-secondary file:px-4 file:text-sm file:font-medium" />
    </div>
    {file && <div className="grid gap-2 text-sm" aria-live="polite">
      <p><strong>{file.name}</strong> ({formatSize(file.size)})</p>
      {/* Local data: preview: next/image cannot optimize it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview && <img src={preview} alt="Pratinjau foto yang dipilih" className="max-h-64 w-full rounded-md object-contain" />}
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="min-h-11" disabled={!file || busy}>{busy ? "Mengunggah..." : "Unggah foto"}</Button>
  </form>;
};
export default UploadForm;
