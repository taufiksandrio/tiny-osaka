"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeRedirect, sendDecision } from "./client";

// Posts the Owner's decision as JSON and navigates in JS (no form action, so form-action CSP is not involved).
const ConsentForm = ({ form }) => {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const decide = async decision => {
    setBusy(decision); setError("");
    try {
      const { redirectTo } = await sendDecision(form, decision);
      if (!safeRedirect(redirectTo)) throw new Error("Alamat tujuan tidak valid. Ulangi proses dari aplikasi klien.");
      window.location.assign(redirectTo);
    } catch (failure) { setError(failure.message); setBusy(null); }
  };
  return <div className="grid gap-4">
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => decide("deny")}>{busy === "deny" ? "Menolak..." : "Tolak"}</Button>
      <Button type="button" disabled={Boolean(busy)} onClick={() => decide("approve")}>{busy === "approve" ? "Menyetujui..." : "Setuju"}</Button>
    </div>
  </div>;
};
export default ConsentForm;
