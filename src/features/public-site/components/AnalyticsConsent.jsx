"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DEFAULT_CONSENT, PRIVACY_EVENT, consentUpdate, ensureGtag, readConsent, writeConsent } from "../analytics.mjs";

// Consent Mode v2 (default denied) + opt-in banner + gtag loader. Rendered only when the server says analytics is active.
// No request to Google happens before "Terima". measurementId arrives as a server-rendered prop (not NEXT_PUBLIC_).
const SCRIPT_ID = "ga4-gtag";

const activate = (measurementId) => {
  const gtag = ensureGtag(window);
  window[`ga-disable-${measurementId}`] = false;
  gtag("consent", "update", consentUpdate(true));
  if (!window.__tinyOsakaAnalytics) {
    window.__tinyOsakaAnalytics = true;
    gtag("js", new Date());
    gtag("config", measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
  }
  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }
};

const deactivate = (measurementId) => {
  window[`ga-disable-${measurementId}`] = true;
  if (typeof window.gtag === "function") window.gtag("consent", "update", consentUpdate(false));
};

const AnalyticsConsent = ({ measurementId }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    ensureGtag(window)("consent", "default", DEFAULT_CONSENT);
    const stored = readConsent(window.localStorage);
    if (stored === "granted") activate(measurementId);
    else if (stored === "denied") deactivate(measurementId);
    else queueMicrotask(() => setOpen(true));
    const reopen = () => setOpen(true);
    window.addEventListener(PRIVACY_EVENT, reopen);
    return () => window.removeEventListener(PRIVACY_EVENT, reopen);
  }, [measurementId]);

  const choose = (granted) => {
    writeConsent(window.localStorage, granted ? "granted" : "denied");
    if (granted) activate(measurementId); else deactivate(measurementId);
    setOpen(false);
  };

  if (!open) return null;
  return (
    <section className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg" role="region" aria-labelledby="consent-title">
      <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="consent-title" className="text-base font-semibold">Pengukuran kunjungan</h2>
          <p className="m-0 text-sm">Kami memakai Google Analytics untuk memahami kunjungan dan klik tombol pesan, hanya jika Anda setuju.
            {" "}<Link href="/privasi" className="underline">Baca kebijakan privasi</Link>.</p>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => choose(false)}>Tolak</Button>
          <Button type="button" variant="outline" onClick={() => choose(true)}>Terima</Button>
        </div>
      </div>
    </section>
  );
};

export default AnalyticsConsent;
