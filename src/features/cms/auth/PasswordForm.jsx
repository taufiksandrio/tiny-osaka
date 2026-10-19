"use client";

import { useState } from "react";
import { authRequest } from "./client";

const PasswordForm = () => {
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    const formElement = event.currentTarget, form = new FormData(formElement);
    const current = String(form.get("currentPassword")), next = String(form.get("newPassword"));
    try {
      if (next.length < 6 || next.length > 128) throw new Error("Password baru harus 6 sampai 128 karakter.");
      if (next !== form.get("confirm")) throw new Error("Konfirmasi password tidak sama.");
      await authRequest("/change-password", { currentPassword: current, newPassword: next });
      setMessage("Password diperbarui. Sesi di perangkat lain telah dikeluarkan.");
      formElement.reset();
    } catch (error) {
      setMessage(error.message === "Permintaan gagal. Periksa isian Anda." ? "Password tidak dapat diubah. Periksa password saat ini dan password baru Anda." : error.message);
    } finally { setBusy(false); }
  };
  return <form className="auth-form" onSubmit={submit}>
    <label htmlFor="current-password">Password saat ini</label>
    <input id="current-password" name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" />
    <label htmlFor="account-new-password">Password baru (minimal 6 karakter)</label>
    <input id="account-new-password" name="newPassword" type="password" required minLength={6} maxLength={128} autoComplete="new-password" />
    <label htmlFor="account-confirm-password">Ulangi password baru</label>
    <input id="account-confirm-password" name="confirm" type="password" required minLength={6} maxLength={128} autoComplete="new-password" />
    <p role="status" aria-live="polite">{message}</p>
    <button className="button button-red" disabled={busy}>{busy ? "Memproses…" : "Ganti password"}</button>
  </form>;
};
export default PasswordForm;
