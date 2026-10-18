"use client";

import { useState } from "react";
import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";

const SIZES = "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw";

// Fixed 4:3 frame (no layout shift); the optimizer serves a small webp. No photo or a failed load shows a neutral
// box of the same size, so card heights stay uniform. Only the first card of /menu is priority.
const ProductCardImage = ({ media, priority = false, sizes = SIZES }) => {
  const [missing, setMissing] = useState(false);
  return <div className="product-card-image">
    {media && !missing ? <Image src={`/media/${media.asset.id}`} alt={media.alt} fill sizes={sizes} quality={75}
      priority={priority} loading={priority ? undefined : "lazy"} className="object-cover" onError={() => setMissing(true)} />
      : <span className="product-card-image-empty" aria-hidden="true"><UtensilsCrossed className="size-10" /></span>}
  </div>;
};
export default ProductCardImage;
