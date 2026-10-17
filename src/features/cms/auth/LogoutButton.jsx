"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authRequest } from "./client";
import { Button } from "@/components/ui/button";
import { LogOut, LoaderCircle } from "lucide-react";

const LogoutButton = () => {
  const router = useRouter();
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true); setMessage("");
    try { await authRequest("/sign-out", {}); router.replace("/admin/login"); router.refresh(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <div className="relative"><Button variant="outline" size="sm" aria-label="Keluar" onClick={logout} disabled={busy}>
    {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}<span className="hidden sm:inline">Keluar</span>
  </Button><p role={message ? "alert" : undefined} aria-live="polite" className={message ? "absolute top-full right-0 z-40 mt-2 w-56 rounded-lg border border-border bg-card p-3 text-sm text-destructive shadow-sm" : "sr-only"}>{message}</p></div>;
};
export default LogoutButton;
