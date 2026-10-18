"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ALT_MAX, DESCRIPTION_MAX, IMAGE_TYPES, NAME_MAX, validateAlt, validateImageFile, validateProduct } from "./product-form.mjs";
import { ORDER_LINK_KEYS, ORDER_LINK_LABELS, checkOrderUrl } from "./order-links.mjs";
// Name, description, price, one image (uploaded on Simpan, never previewed here) and three optional order links.
const LINK_HINT = "Opsional. Tempel link produk atau toko dari aplikasi/situs resmi.";
const ORDER = ["name", "description", "price", "image", "alt", ...ORDER_LINK_KEYS];
const Field = ({ id, label, error, hint, children }) => <div className="grid gap-2">
  <Label htmlFor={id}>{label}</Label>{children}
  {hint && <p id={id + "-hint"} className="text-xs text-muted-foreground">{hint}</p>}
  {error && <p id={id + "-error"} className="text-sm text-destructive">{error}</p>}
</div>;
const ProductForm = ({ product, busy, serverError, onSubmit, onCancel }) => {
  const id = useId(), fileRef = useRef(null);
  const [values, setValues] = useState(() => ({ name: product?.name ?? "", description: product?.description ?? "", price: product ? String(product.price) : "",
    alt: product?.image?.alt ?? "", ...Object.fromEntries(ORDER_LINK_KEYS.map(key => [key, product?.[key] ?? ""])) }));
  const [file, setFile] = useState(null), [removed, setRemoved] = useState(false);
  const [errors, setErrors] = useState({}), [live, setLive] = useState(""), [focus, setFocus] = useState(null);
  const hasImage = Boolean(file) || (Boolean(product?.image) && !removed);
  const remote = serverError?.field ? { [serverError.field]: serverError.message } : {};
  const problem = key => errors[key] ?? remote[key];
  const controlId = key => key === "image" ? `${id}-image-button` : `${id}-${key}`;
  // Typing clears that field's error; blur only ever adds one. A blur that removed an error would shift the layout under the pointer and swallow the click on Simpan.
  const set = key => event => { setValues(previous => ({ ...previous, [key]: event.target.value })); setErrors(previous => previous[key] ? { ...previous, [key]: undefined } : previous); };
  useEffect(() => { if (focus) document.getElementById(controlId(focus.key))?.focus(); }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (serverError?.field) document.getElementById(controlId(serverError.field))?.focus(); }, [serverError]); // eslint-disable-line react-hooks/exhaustive-deps
  const fail = found => {
    const keys = ORDER.filter(key => found[key]);
    setLive(`${keys.length} isian perlu diperbaiki. ${found[keys[0]]}`); setFocus({ key: keys[0], n: Date.now() });
  };
  const submit = event => {
    event.preventDefault();
    const found = validateProduct({ ...values, hasImage });
    setErrors(found);
    if (Object.keys(found).length) return fail(found);
    onSubmit({ ...values, file, removed });
  };
  const blurLink = key => () => { const checked = checkOrderUrl(key, values[key]); if (!checked.ok) { setErrors(previous => ({ ...previous, [key]: checked.message })); setLive(checked.message); } };
  const blurAlt = () => { if (!hasImage) return; const message = validateAlt(values.alt); if (message) { setErrors(previous => ({ ...previous, alt: message })); setLive(message); } };
  const pick = event => {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    const message = validateImageFile(chosen);
    event.target.value = "";
    if (message) { setErrors(previous => ({ ...previous, image: message })); setLive(message); return; }
    setErrors(previous => ({ ...previous, image: undefined }));
    setFile(chosen); setLive(`Gambar ${chosen.name} dipilih. Isi teks alternatif gambar.`);
    // A new picture needs its own description; never silently reuse the old one.
    setValues(previous => previous.alt === (product?.image?.alt ?? "") ? { ...previous, alt: "" } : previous);
  };
  const drop = () => {
    setFile(null); setRemoved(Boolean(product?.image)); setValues(previous => ({ ...previous, alt: "" }));
    setErrors(previous => ({ ...previous, image: undefined, alt: undefined })); setLive("Gambar dilepas."); setFocus({ key: "image", n: Date.now() });
  };
  const props = key => ({ id: controlId(key), value: values[key], onChange: set(key), disabled: busy, "aria-invalid": problem(key) ? true : undefined,
    "aria-describedby": [problem(key) && `${controlId(key)}-error`, `${controlId(key)}-hint`].filter(Boolean).join(" ") });
  const status = file ? `Gambar dipilih: ${file.name}. Akan diunggah saat Anda menekan Simpan.` : hasImage ? "Gambar terpasang." :
    removed ? "Gambar akan dilepas saat Anda menekan Simpan." : "Belum ada gambar.";
  const imageIds = [problem("image") && `${id}-image-button-error`, `${id}-image-hint`, `${id}-image-status`].filter(Boolean).join(" ");
  return <form onSubmit={submit} noValidate className="grid gap-4">
    <Field id={`${id}-name`} label="Nama produk (wajib)" error={problem("name")} hint={`Maksimal ${NAME_MAX} karakter.`}><Input {...props("name")} required autoComplete="off" className="min-h-11" /></Field>
    <Field id={`${id}-description`} label="Deskripsi (opsional)" error={problem("description")} hint={`Maksimal ${DESCRIPTION_MAX} karakter.`}><Textarea {...props("description")} rows={4} /></Field>
    <Field id={`${id}-price`} label="Harga dalam rupiah (wajib)" error={problem("price")} hint="Angka bulat, contoh 25000."><Input {...props("price")} required inputMode="numeric" autoComplete="off" className="min-h-11" /></Field>
    <div className="grid gap-2">
      <Label htmlFor={`${id}-image`}>Gambar produk (opsional)</Label>
      <input ref={fileRef} id={`${id}-image`} type="file" accept={IMAGE_TYPES.join(",")} className="sr-only" tabIndex={-1} disabled={busy} onChange={pick} />
      <div className="flex flex-wrap gap-2">
        <Button id={`${id}-image-button`} type="button" variant="outline" className="min-h-11" disabled={busy} aria-invalid={problem("image") ? true : undefined} aria-describedby={imageIds}
          onClick={() => fileRef.current?.click()}>{hasImage ? "Ganti gambar" : "Pilih gambar"}</Button>
        {hasImage && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={drop}>Hapus gambar</Button>}
      </div>
      <p id={`${id}-image-status`} role="status" className="wrap-break-word text-sm">{status}</p>
      <p id={`${id}-image-hint`} className="text-xs text-muted-foreground">JPEG, PNG, atau WebP, maksimal 10 MB. Gambar diunggah saat Simpan.</p>
      {problem("image") && <p id={`${id}-image-button-error`} className="text-sm text-destructive">{problem("image")}</p>}
    </div>
    {hasImage && <Field id={`${id}-alt`} label="Teks alternatif gambar (wajib)" error={problem("alt")} hint={`Jelaskan isi gambar untuk pembaca layar. Maksimal ${ALT_MAX} karakter.`}>
      <Input {...props("alt")} required autoComplete="off" className="min-h-11" onBlur={blurAlt} /></Field>}
    {ORDER_LINK_KEYS.map(key => <Field key={key} id={`${id}-${key}`} label={`Link ${ORDER_LINK_LABELS[key]}`} error={problem(key)} hint={LINK_HINT}>
      <Input {...props(key)} type="url" inputMode="url" autoComplete="off" placeholder="https://" className="min-h-11" onBlur={blurLink(key)} /></Field>)}
    <p role="alert" className="sr-only">{serverError?.field ? serverError.message : live}</p>
    <div className="grid gap-3">
      {serverError && !serverError.field && <p role="alert" className="text-sm text-destructive">{serverError.message}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onCancel}>Batal</Button>
        <Button type="submit" className="min-h-11" disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</Button>
      </div>
    </div>
  </form>;
};
const ProductModal = ({ open, product, busy, serverError, onSubmit, onClose, onCloseAutoFocus }) => <Dialog open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}>
  <DialogContent closeDisabled={busy} onCloseAutoFocus={onCloseAutoFocus} onInteractOutside={event => busy && event.preventDefault()} onEscapeKeyDown={event => busy && event.preventDefault()}>
    <DialogTitle>{product ? "Ubah produk" : "Tambah produk"}</DialogTitle>
    <DialogDescription>{product ? "Perubahan langsung tampil di website publik." : "Produk baru langsung tampil di website publik."}</DialogDescription>
    <ProductForm key={product?.slug ?? "new"} product={product} busy={busy} serverError={serverError} onSubmit={onSubmit} onCancel={onClose} />
  </DialogContent>
</Dialog>;
export default ProductModal;
