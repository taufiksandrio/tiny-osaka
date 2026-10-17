"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authRequest } from "./client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LoaderCircle, LockKeyhole, ArrowRight } from "lucide-react";

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
  return <form className="grid gap-4" onSubmit={submit}>
    {challenge ? <>
      <p>Verifikasi keamanan akun Owner.</p>
      <Label htmlFor="mfa-method">Metode verifikasi</Label>
      <NativeSelect id="mfa-method" value={method} disabled={busy} onChange={event => setMethod(event.target.value)}>
        <NativeSelectOption value="totp">Aplikasi authenticator</NativeSelectOption><NativeSelectOption value="backup">Kode pemulihan</NativeSelectOption>
      </NativeSelect>
      <Label htmlFor="login-code">Kode verifikasi</Label><Input id="login-code" name="code" autoComplete="one-time-code" required maxLength={128} disabled={busy} />
    </> : <>
      <div className="grid gap-2"><Label htmlFor="login-email">Email akun internal</Label><Input id="login-email" type="email" name="email" autoComplete="username" placeholder="nama@contoh.com" required maxLength={254} disabled={busy} /></div>
      <div className="grid gap-2"><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" name="password" autoComplete="current-password" required maxLength={128} disabled={busy} /></div>
    </>}
    <p role="status" aria-live="polite" className="text-sm text-destructive">{message}</p>
    <Button type="submit" className="h-11 w-full" disabled={busy}>
      {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
      {busy ? "Memproses…" : challenge ? "Verifikasi" : "Masuk"}{!busy && <ArrowRight className="ml-auto" aria-hidden="true" />}
    </Button>
    {!challenge && <Link href="/admin/reset-password" className="justify-self-center text-sm font-medium text-primary hover:underline">Lupa password?</Link>}
  </form>;
};
export default LoginForm;
