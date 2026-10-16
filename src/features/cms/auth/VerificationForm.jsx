"use client";
import { useState } from "react";
import { useAuthToken } from "./useAuthToken";
import { authRequest } from "./client";

const VerificationForm = () => {
  const token = useAuthToken();
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const verify = async () => {
    setBusy(true);
    try { await authRequest("/verify-email", { token }); setMessage("Email terverifikasi. Silakan masuk kembali."); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <><p>Gunakan tautan yang dikirim ke alamat email akun Anda.</p>
    <button className="button button-red" disabled={!token || busy} onClick={verify}>Verifikasi email</button>
    <p role="status">{message}</p></>;
};
export default VerificationForm;
