"use client";

import { useState } from "react";
import { authRequest } from "./client";
import { useAuthToken } from "./useAuthToken";

const ResetForm = () => {
  const token = useAuthToken();
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (token) {
        if (form.get("password") !== form.get("confirm")) throw new Error("Password tidak sama.");
        await authRequest("/reset-password", { token, newPassword: form.get("password") });
        setMessage("Password diperbarui. Silakan masuk kembali.");
        event.target.reset();
      } else {
        await authRequest("/request-password-reset", { email: form.get("email"), redirectTo: "/admin/reset-password" });
        setMessage("Jika akun memenuhi syarat, tautan reset akan dikirim ke email terverifikasi.");
      }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <form className="auth-form" onSubmit={submit}>
    {token ? <>
      <label htmlFor="new-password">Password baru (minimal 6 karakter)</label><input id="new-password" name="password" type="password" minLength={6} maxLength={128} required autoComplete="new-password" />
      <label htmlFor="confirm-password">Ulangi password baru</label><input id="confirm-password" name="confirm" type="password" minLength={6} maxLength={128} required autoComplete="new-password" />
    </> : <><p>Pengiriman email belum dikonfigurasi pada development ini. Reset melalui email akan tersedia setelah penyedia email disiapkan.</p>
      <label htmlFor="reset-email">Email akun</label><input id="reset-email" name="email" type="email" maxLength={254} required autoComplete="email" /></>}
    <p role="status" aria-live="polite">{message}</p>
    <button className="button button-red" disabled={busy}>{busy ? "Memproses…" : token ? "Simpan password baru" : "Minta tautan reset"}</button>
  </form>;
};
export default ResetForm;
