// Client-side mirror of the server limits; the server stays authoritative.
export const NAME_MAX = 120, DESCRIPTION_MAX = 1000;
const unsafe = /[<>]/;
export const parsePrice = text => {
  const value = String(text).trim();
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};
export const validateProduct = ({ name, description, price }) => {
  const errors = {}, cleanName = name.trim();
  if (!cleanName || cleanName.length > NAME_MAX || unsafe.test(cleanName)) errors.name = `Nama wajib diisi (maksimal ${NAME_MAX} karakter) tanpa tanda < atau >.`;
  if (description.length > DESCRIPTION_MAX || unsafe.test(description)) errors.description = `Deskripsi maksimal ${DESCRIPTION_MAX} karakter tanpa tanda < atau >.`;
  if (parsePrice(price) === null) errors.price = "Harga harus angka bulat rupiah, 0 atau lebih.";
  return errors;
};
export const toPayload = ({ name, description, price }) => ({ name: name.trim(), description: description.trim(), price: parsePrice(price) });
export const formatRupiah = amount => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
