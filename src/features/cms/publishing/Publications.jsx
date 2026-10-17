"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { wibToUtc, formatSchedule } from "@/server/publishing/policy.mjs";

const request = async input => {
  const response = await fetch("/api/cms/publications", input ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code ?? "CMS_UNAVAILABLE");
  return data;
};
const messages = { SCHEDULE_EXISTS: "Target ini sudah memiliki jadwal aktif. Batalkan jadwal sebelumnya untuk menggantinya.",
  INVALID_TIME: "Pilih waktu mendatang dalam 365 hari, menggunakan WIB.", SCHEDULE_CONFLICT: "Jadwal berubah. Muat ulang daftar.",
  REVISION_UNAVAILABLE: "Revisi berubah atau belum disetujui. Muat ulang halaman.", FORBIDDEN: "Hanya Owner yang dapat mengatur jadwal." };
const statusLabels = { scheduled: "Terjadwal", succeeded: "Terbit", cancelled: "Dibatalkan", failed: "Gagal" };
const reasonLabels = { OWNER_UNAVAILABLE: "Akun Owner tidak aktif atau tidak lagi berperan Owner.", PUBLICATION_CHANGED: "Publikasi telah berubah sejak penjadwalan.",
  REVISION_UNAVAILABLE: "Revisi tidak tersedia untuk publikasi.", PUBLISH_FAILED: "Publikasi gagal. Periksa kesiapan revisi dan koneksi database.",
  RETRY: "Menunggu percobaan berikutnya.", MANUAL_PUBLICATION: "Digantikan publikasi manual.", CANCELLED: "Dibatalkan Owner." };

export const SchedulePanel = ({ domain, revision, role, disabled, time: approvalTime, onTimeChange }) => {
  const [time, setTime] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  if (role === "owner" && ["draft", "review"].includes(revision.status) && onTimeChange) return <Card className="shadow-none">
    <CardHeader><h2>Waktu publikasi</h2><CardDescription>Kosongkan agar langsung tampil saat disetujui. Isi hanya untuk menjadwalkan publikasi (WIB).</CardDescription></CardHeader>
    <CardContent className="space-y-3"><Label htmlFor={`approval-time-${domain}`}>Jadwal publikasi (opsional, WIB)</Label>
      <Input id={`approval-time-${domain}`} type="datetime-local" disabled={disabled} onChange={event => {
        try { onTimeChange(event.target.value ? wibToUtc(event.target.value) : ""); setMessage(""); }
        catch { setMessage(messages.INVALID_TIME); }
      }} />
      {approvalTime && <p className="text-sm">Akan terbit {formatSchedule(approvalTime)} setelah disetujui.</p>}
      <p aria-live="polite" className="text-sm">{message}</p>
    </CardContent></Card>;
  if (revision.status !== "approved") return null;
  const schedule = async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await request({ action: "schedule", domain, revisionId: revision.id, expectedVersion: revision.version, expectedHash: revision.contentHash, dueAt: wibToUtc(time) });
      setMessage("Jadwal tersimpan. Pantau statusnya di Publikasi terjadwal."); setTime("");
    } catch (error) { setMessage(messages[error.message] ?? "Jadwal belum tersimpan. Coba lagi atau muat ulang halaman."); }
    finally { setBusy(false); }
  };
  return <Card className="shadow-none"><CardHeader><CardTitle><h2>Jadwalkan publikasi</h2></CardTitle>
    <CardDescription>Jadwal berlaku untuk versi revisi yang telah disetujui. Konten publik tetap tampil hingga publikasi berhasil.</CardDescription></CardHeader>
    <CardContent className="space-y-4">{role === "owner" ? <form onSubmit={schedule} className="flex flex-wrap items-end gap-4">
      <div className="grid gap-3"><Label htmlFor={`schedule-${domain}`}>Tanggal dan waktu (WIB)</Label>
        <Input id={`schedule-${domain}`} type="datetime-local" required value={time} disabled={disabled || busy} onChange={event => setTime(event.target.value)} /></div>
      <Button type="submit" disabled={disabled || busy}>{busy ? "Menyimpan…" : "Simpan jadwal"}</Button>
    </form> : <p className="text-sm text-muted-foreground">Owner dapat menjadwalkan revisi ini.</p>}
      <p role="status" className="text-sm">{message}</p><Button asChild variant="outline"><Link href="/admin/publications">Lihat publikasi terjadwal</Link></Button>
    </CardContent></Card>;
};

const Publications = ({ initial, role }) => {
  const [rows, setRows] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const reload = async () => { setBusy(true); try { setRows(await request()); setMessage(""); } catch { setMessage("Daftar belum dapat dimuat."); } finally { setBusy(false); } };
  // Refresh while this screen is open; the worker never depends on this tab.
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => { request().then(data => { if (active) setRows(data); }).catch(() => {}); }, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const cancel = async row => {
    setBusy(true);
    try { await request({ action: "cancel", jobId: row.id, expectedVersion: row.version }); setRows(await request()); setMessage("Jadwal dibatalkan."); }
    catch (error) { setMessage(messages[error.message] ?? "Pembatalan belum berhasil. Muat ulang daftar."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-muted-foreground">Jadwal aktif dan riwayat terbaru (maks. 100) · Semua waktu menggunakan WIB</p>
    <Button variant="outline" disabled={busy} onClick={reload}>Muat ulang jadwal</Button></div><p role="status" className="text-sm">{message}</p>
    {rows.length === 0 && <Card><CardContent className="py-8 text-muted-foreground">Belum ada jadwal. Buka revisi yang telah disetujui untuk menjadwalkan publikasi.</CardContent></Card>}
    <div className="grid gap-4">{rows.map(row => <Card key={row.id} className="shadow-none"><CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle><h2>{row.target === "catalog" ? "Katalog menu" : `Halaman ${row.target.slice(5)}`}</h2></CardTitle>
        <Badge variant={row.status === "failed" ? "destructive" : "secondary"}>{statusLabels[row.status]}</Badge></div>
      <CardDescription>{formatSchedule(row.due_at)} · Versi revisi {row.revision_version} · Percobaan {row.attempts}/3</CardDescription>
    </CardHeader><CardContent className="space-y-4">{row.last_code && <p className="text-sm text-muted-foreground">{reasonLabels[row.last_code]}</p>}
      {row.last_code === "RETRY" && <p className="text-sm">Percobaan berikut: {formatSchedule(row.next_attempt_at)}</p>}
      <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><Link href={row.page_revision_id ? `/admin/pages/${row.target.slice(5)}/${row.page_revision_id}` : `/admin/catalog/${row.catalog_revision_id}`}>Buka revisi</Link></Button>
        {role === "owner" && row.status === "scheduled" && <Button variant="destructive" disabled={busy} onClick={() => cancel(row)}>Batalkan jadwal</Button>}</div>
    </CardContent></Card>)}</div></div>;
};
export default Publications;
