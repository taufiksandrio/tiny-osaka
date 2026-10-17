"use client";
import { useId, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX, NAME_MAX, validateProduct } from "./product-form.mjs";
// Name, description and price only; images are intentionally not editable here (spec section 5).
const Field = ({ id, label, error, hint, children }) => <div className="grid gap-2">
  <Label htmlFor={id}>{label}</Label>{children}
  {hint && <p id={id + "-hint"} className="text-xs text-muted-foreground">{hint}</p>}
  {error && <p id={id + "-error"} className="text-sm text-destructive">{error}</p>}
</div>;
const ProductForm = ({ product, busy, serverError, onSubmit, onCancel }) => {
  const id = useId();
  const [values, setValues] = useState({ name: product?.name ?? "", description: product?.description ?? "", price: product ? String(product.price) : "" });
  const [errors, setErrors] = useState({});
  const set = key => event => setValues(previous => ({ ...previous, [key]: event.target.value }));
  const submit = event => {
    event.preventDefault();
    const found = validateProduct(values);
    setErrors(found);
    if (!Object.keys(found).length) onSubmit(values);
  };
  const props = key => ({ id: `${id}-${key}`, value: values[key], onChange: set(key), disabled: busy, "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": [errors[key] && `${id}-${key}-error`, `${id}-${key}-hint`].filter(Boolean).join(" ") });
  return <form onSubmit={submit} noValidate className="grid gap-4">
    <Field id={`${id}-name`} label="Nama produk (wajib)" error={errors.name} hint={`Maksimal ${NAME_MAX} karakter.`}><Input {...props("name")} required autoComplete="off" className="min-h-11" /></Field>
    <Field id={`${id}-description`} label="Deskripsi (opsional)" error={errors.description} hint={`Maksimal ${DESCRIPTION_MAX} karakter.`}><Textarea {...props("description")} rows={4} /></Field>
    <Field id={`${id}-price`} label="Harga dalam rupiah (wajib)" error={errors.price} hint="Angka bulat, contoh 25000."><Input {...props("price")} required inputMode="numeric" autoComplete="off" className="min-h-11" /></Field>
    <div className="grid gap-3">
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
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
