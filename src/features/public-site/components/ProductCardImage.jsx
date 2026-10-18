"use client";

import { useState } from "react";
import Image from "next/image";

// Fixed 4:3 frame (no layout shift); the optimizer serves a small webp. Only the first card of /menu is priority.
const ProductCardImage = ({ media, priority = false }) => {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return <div className="product-card-image">
    <Image src={`/media/${media.asset.id}`} alt={media.alt} fill sizes="(max-width: 640px) 100vw, 33vw" quality={75}
      priority={priority} loading={priority ? undefined : "lazy"} className="object-cover" onError={() => setMissing(true)} />
  </div>;
};
export default ProductCardImage;
