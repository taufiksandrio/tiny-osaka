"use client";
import { useState } from "react";
import Image from "next/image";
import { ImageOff, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "./product-form.mjs";
const ProductImage = ({ product }) => {
  const [failed, setFailed] = useState(false);
  const image = product.image;
  return <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-xl bg-muted">
    {image && !failed ? <Image src={`/api/cms/media/${image.assetId}`} alt={image.alt || `Foto ${product.name}`} fill unoptimized className="object-cover"
      sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw" onError={() => setFailed(true)} /> :
      <div role="img" aria-label={`Belum ada gambar untuk ${product.name}`} className="flex size-full items-center justify-center text-muted-foreground"><ImageOff className="size-10" aria-hidden="true" /></div>}
  </div>;
};
const ProductCard = ({ product, canDelete, busy, onEdit, onDelete }) => <li className="min-w-0">
  <Card className="h-full gap-0 overflow-hidden py-0 shadow-none">
    <ProductImage product={product} />
    <CardContent className="flex flex-1 flex-col gap-4 p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="wrap-break-word text-lg">{product.name}</h3>
        {product.description && <p className="wrap-break-word whitespace-pre-line text-sm text-muted-foreground">{product.description}</p>}
        <p className="font-semibold">{formatRupiah(product.price)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11 flex-1" disabled={busy} onClick={event => onEdit(product, event.currentTarget)} aria-label={`Edit ${product.name}`}><Pencil aria-hidden="true" />Edit</Button>
        {canDelete && <Button type="button" variant="destructive" className="ml-auto min-h-11" disabled={busy} onClick={() => onDelete(product)} aria-label={`Hapus ${product.name}`}><Trash2 aria-hidden="true" />Hapus</Button>}
      </div>
    </CardContent>
  </Card>
</li>;
export default ProductCard;
