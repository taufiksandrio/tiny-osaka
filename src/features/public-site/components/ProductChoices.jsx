"use client";

import { useState } from "react";
import { calculatePrice } from "@/server/catalog/pricing.mjs";
import { formatPrice } from "@/server/public/view-models.mjs";

const ProductChoices = ({ product, locale }) => {
  const [variantId, setVariant] = useState(product.variants[0].id);
  const [optionIds, setOptions] = useState([]);
  let total = null;
  try { total = calculatePrice(product, { revisionId: product.revisionId, productId: product.productId, variantId, optionIds }); }
  catch { /* Incomplete selections have an explicit local message. */ }
  const toggle = (group, id, checked) => setOptions(previous => {
    const remaining = previous.filter(value => group.selectionType !== "single" || !group.options.some(option => option.id === value));
    return checked ? [...remaining.filter(value => value !== id), id] : remaining.filter(value => value !== id);
  });
  return <section className="prose-panel" aria-label={locale === "id" ? "Pilihan produk" : "Product choices"}>
    <label htmlFor="product-variant">{locale === "id" ? "Varian" : "Variant"}</label>
    <select id="product-variant" value={variantId} onChange={event => setVariant(event.target.value)}>
      {product.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.title} — {formatPrice(variant.basePrice, locale)}</option>)}
    </select>
    {product.groups.map(group => <fieldset key={group.id}>
      <legend>{group.title} ({group.minSelections}–{group.maxSelections})</legend>
      {group.options.map(option => <label className="modifier-choice" key={option.id}>
        <input type="checkbox" checked={optionIds.includes(option.id)}
          disabled={!optionIds.includes(option.id) && group.selectionType !== "single" && group.options.filter(row => optionIds.includes(row.id)).length >= group.maxSelections}
          onChange={event => toggle(group, option.id, event.target.checked)} />
        {option.title} (+{formatPrice(option.priceDelta, locale)})
      </label>)}
    </fieldset>)}
    <p role="status" aria-live="polite">{total === null ? (locale === "id" ? "Lengkapi pilihan sesuai batas setiap grup." : "Complete the choices within each group limit.") :
      `${locale === "id" ? "Harga pilihan" : "Selected price"}: ${formatPrice(total, locale)}`}</p>
  </section>;
};
export default ProductChoices;
