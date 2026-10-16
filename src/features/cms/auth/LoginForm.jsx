"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authRequest } from "./client";

const LoginForm = () => {
  const router = useRouter();
  const [challenge, setChallenge] = useState(false), [method, setMethod] = useState("totp");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const submit = async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const data = challenge ? await authRequest(method === "totp" ? "/two-factor/verify-totp" : "/two-factor/verify-backup-code", { code: form.get("code") }) :
        await authRequest("/sign-in/email", { email: form.get("email"), password: form.get("password"), callbackURL: "/admin" });
      if (data.twoFactorRedirect) { setChallenge(true); event.target.reset(); }
      else { router.replace("/admin"); router.refresh(); }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <form className="auth-form" onSubmit={submit}>
    {challenge ? <>
      <p>Verifikasi keamanan akun Owner.</p>
      <label htmlFor="mfa-method">Metode verifikasi</label>
      <select id="mfa-method" value={method} onChange={event => setMethod(event.target.value)}>
        <option value="totp">Aplikasi authenticator</option><option value="backup">Kode pemulihan</option>
      </select>
      <label htmlFor="login-code">Kode verifikasi</label><input id="login-code" name="code" autoComplete="one-time-code" required maxLength={128} />
    </> : <>
      <label htmlFor="login-email">Email akun internal</label><input id="login-email" type="email" name="email" autoComplete="username" required maxLength={254} />
      <label htmlFor="login-password">Password</label><input id="login-password" type="password" name="password" autoComplete="current-password" required maxLength={128} />
    </>}
    <p role="status" aria-live="polite">{message}</p>
    <button className="button button-red" disabled={busy}>{busy ? "Memproses…" : challenge ? "Verifikasi" : "Masuk"}</button>
    {!challenge && <Link href="/admin/reset-password">Lupa password?</Link>}
  </form>;
};
export default LoginForm;
