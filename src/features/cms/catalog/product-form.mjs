import { ORDER_LINK_KEYS, checkOrderUrl } from "./order-links.mjs";
// Client-side mirror of the server limits; the server stays authoritative.
export const NAME_MAX = 120, DESCRIPTION_MAX = 1000, ALT_MAX = 500, IMAGE_MAX_BYTES = 10_000_000;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const unsafe = /[<>]/;
export const parsePrice = text => {
  const value = String(text).trim();
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};
export const validateAlt = text => {
  const alt = String(text ?? "").trim();
  if (!alt) return "Teks alternatif gambar wajib diisi.";
  if (alt.length > ALT_MAX) return `Teks alternatif maksimal ${ALT_MAX} karakter.`;
  if (unsafe.test(alt) || /[\u0000-\u001f\u007f]/.test(alt)) return "Teks alternatif tidak boleh memuat < atau >.";
  return null;
};
export const validateImageFile = file => {
  if (!IMAGE_TYPES.includes(file.type)) return "Format gambar harus JPEG, PNG, atau WebP.";
  if (file.size > IMAGE_MAX_BYTES) return "Ukuran gambar maksimal 10 MB.";
  return null;
};
// values: { name, description, price, alt?, hasImage?, grabfoodUrl?, gofoodUrl?, shopeefoodUrl? }. Returns { field: message }.
export const validateProduct = ({ name, description, price, alt, hasImage, ...links }) => {
  const errors = {}, cleanName = name.trim();
  if (!cleanName || cleanName.length > NAME_MAX || unsafe.test(cleanName)) errors.name = `Nama wajib diisi (maksimal ${NAME_MAX} karakter) tanpa tanda < atau >.`;
  if (description.length > DESCRIPTION_MAX || unsafe.test(description)) errors.description = `Deskripsi maksimal ${DESCRIPTION_MAX} karakter tanpa tanda < atau >.`;
  if (parsePrice(price) === null) errors.price = "Harga harus angka bulat rupiah, 0 atau lebih.";
  if (hasImage) { const message = validateAlt(alt); if (message) errors.alt = message; }
  for (const key of ORDER_LINK_KEYS) { const checked = checkOrderUrl(key, links[key]); if (!checked.ok) errors[key] = checked.message; }
  return errors;
};
export const toPayload = ({ name, description, price }) => ({ name: name.trim(), description: description.trim(), price: parsePrice(price) });
// Full request body. `product` is the stored card when editing; `assetId` is the id of a file uploaded just before.
// Create sends only filled links. Edit sends only the keys that changed (cleared input = null); image keys follow the API contract.
export const buildPayload = (values, product, assetId) => {
  const payload = toPayload(values), alt = String(values.alt ?? "").trim();
  for (const key of ORDER_LINK_KEYS) {
    const next = checkOrderUrl(key, values[key]).value ?? null, before = product?.[key] ?? null;
    if (product ? next !== before : next !== null) payload[key] = next;
  }
  if (assetId) Object.assign(payload, { imageAssetId: assetId, imageAlt: alt });
  else if (product?.image && values.removed) payload.imageAssetId = null;
  else if (product?.image && alt !== (product.image.alt ?? "")) payload.imageAlt = alt;
  return payload;
};
export const formatRupiah = amount => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
