"use client";
import { useState } from "react";
import { createClient, disableClient, isValidRedirectUri, loadClients } from "./client";
// State for the Owner "Koneksi MCP" page. Initial list is rendered by the server component.
const useMcpClients = initial => {
  const [clients, setClients] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const reload = async () => setClients((await loadClients()).clients);
  const create = async ({ name, redirectUrisText }) => {
    const redirectUris = redirectUrisText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const trimmed = name.trim();
    let message = "";
    if (!trimmed || trimmed.length > 80 || /[<>]/.test(trimmed)) message = "Nama klien wajib diisi (maksimal 80 karakter) dan tidak boleh memuat tanda < atau >.";
    else if (!redirectUris.length || redirectUris.length > 5 || new Set(redirectUris).size !== redirectUris.length) message = "Isi 1 sampai 5 redirect URI unik, satu per baris.";
    else if (!redirectUris.every(isValidRedirectUri)) message = "Setiap redirect URI harus https, atau http://localhost / 127.0.0.1 / [::1], tanpa fragmen (#).";
    if (message) { setError(message); setAnnouncement(message); return false; }
    setCreating(true); setError(""); setAnnouncement("Mendaftarkan klien...");
    try {
      await createClient({ name: trimmed, redirectUris });
      await reload();
      setAnnouncement(`Klien ${trimmed} didaftarkan.`);
      return true;
    } catch (failure) { setError(failure.message); setAnnouncement(failure.message); return false; }
    finally { setCreating(false); }
  };
  const revoke = async client => {
    setBusyId(client.clientId); setError(""); setAnnouncement(`Mencabut ${client.name}...`);
    try {
      await disableClient(client.clientId);
      await reload();
      setAnnouncement(`Klien ${client.name} dicabut dan semua tokennya tidak berlaku lagi.`);
    } catch (failure) { setError(failure.message); setAnnouncement(`Gagal mencabut ${client.name}. ${failure.message}`); }
    finally { setBusyId(null); }
  };
  return { clients, creating, busyId, announcement, error, create, revoke };
};
export default useMcpClients;
