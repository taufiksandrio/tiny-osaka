"use client";

import { useState } from "react";
import { authRequest } from "./client";

const SecurityForm = ({ enabled }) => {
  const [setup, setSetup] = useState(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [verified, setVerified] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (setup) {
        await authRequest("/two-factor/verify-totp", { code: form.get("code") });
        setVerified(true); setMessage("MFA aktif. Simpan kode pemulihan sebelum menutup halaman.");
      } else if (enabled) {
        await authRequest("/two-factor/disable", { password: form.get("password") });
        window.location.reload();
      } else {
        setSetup(await authRequest("/two-factor/enable", { password: form.get("password") }));
        event.target.reset();
      }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <>
    <p>MFA {enabled || verified ? "aktif" : "belum aktif"}. MFA bersifat opsional untuk Owner.</p>
    {setup && <section aria-labelledby="setup-secret-title">
      <h2 id="setup-secret-title">Siapkan aplikasi authenticator</h2>
      <p>Tambahkan akun secara manual menggunakan kunci berikut. Jangan bagikan kunci ini.</p>
      <code className="auth-secret">{new URL(setup.totpURI).searchParams.get("secret")}</code>
      <h3>Kode pemulihan sekali pakai</h3><p>Simpan di tempat aman. Kode ini hanya ditampilkan saat pengaturan.</p>
      <ul>{setup.backupCodes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
    </section>}
    {verified ? <button className="button button-red" onClick={() => window.location.reload()}>Kode sudah saya simpan</button> :
      <form className="auth-form" onSubmit={submit}>
        {setup ? <><label htmlFor="setup-code">Kode dari authenticator</label><input id="setup-code" name="code" autoComplete="one-time-code" required inputMode="numeric" pattern="[0-9]{6}" /></> :
          <><label htmlFor="mfa-password">Konfirmasi password saat ini</label><input id="mfa-password" name="password" type="password" autoComplete="current-password" required maxLength={128} /></>}
        <button className="button button-red" disabled={busy}>{busy ? "Memproses…" : setup ? "Aktifkan MFA" : enabled ? "Nonaktifkan MFA" : "Siapkan MFA"}</button>
      </form>}
    <p role="status" aria-live="polite">{message}</p>
  </>;
};
export default SecurityForm;
