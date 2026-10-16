export const authRequest = async (path, body) => {
  const response = await fetch(`/api/auth${path}`, { method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 429 ? "Terlalu banyak percobaan. Tunggu sebelum mencoba lagi." :
    response.status === 503 ? "Layanan belum tersedia atau belum dikonfigurasi." : "Permintaan gagal. Periksa isian Anda.");
  return data;
};
