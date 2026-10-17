"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { catalogRequest } from "./client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
const titles = { clone: "Buat draft dari revisi ini", submit: "Kirim untuk review", approve: "Setujui", reject: "Tolak revisi", publish: "Terbitkan revisi", archive: "Arsipkan revisi" };
export const CreateCatalogDraft = () => {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div className="grid gap-3"><Button disabled={busy} onClick={async () => {
    setBusy(true); setMessage("");
    try { const graph = await catalogRequest("", {}); router.push(`/admin/catalog/${graph.revision.id}`); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }}>Buat draft katalog</Button><p role="status">{message}</p></div>;
};
const CatalogActions = ({ graph, role, disabled, busy, onBusy, onChange, onMessage, children, feedback, beforeAction }) => {
  const [confirm, setConfirm] = useState(null), router = useRouter(), trigger = useRef(null), section = useRef(null);
  const revision = graph.revision, actions = ["clone"];
  if (revision.status === "draft") actions.push(role === "owner" ? "approve" : "submit");
  if (role === "owner") {
    if (revision.status === "review") actions.push("approve", "reject");
    if (revision.status === "approved") actions.push("approve", "archive");
    if (["rejected", "published"].includes(revision.status) && !graph.isLive) actions.push("archive");
  }
  const execute = async () => {
    const action = confirm; setConfirm(null); onBusy(true); onMessage("");
    const data = action === "clone" ? { sourceRevisionId: revision.id, expectedSourceVersion: revision.version } :
      { revisionId: revision.id, expectedVersion: revision.version, ...(action === "submit" ? {} : { expectedHash: revision.contentHash }) };
    try {
      const next = await catalogRequest(`/${revision.id}/actions`, { action, data });
      if (action === "clone") router.push(`/admin/catalog/${next.revision.id}`);
      else { onChange(next); onMessage(action === "approve" ? (next.revision.status === "published" ? "Disetujui. Konten baru sudah tampil di website." : "Persetujuan tersimpan. Muat ulang untuk memeriksa status konten.") : "Tindakan berhasil: " + titles[action] + "."); }
      router.refresh();
    } catch (error) { onMessage(error.message); } finally { onBusy(false); }
  };
  return <section ref={section} tabIndex={-1} aria-label="Tindakan katalog"><Card className="shadow-none"><CardHeader><h2>Tindakan katalog</h2>
    <CardDescription>Simpan semua perubahan sebelum melanjutkan. Owner menyetujui untuk langsung menampilkan konten; Staff mengirim untuk review.</CardDescription></CardHeader>
    <CardContent className="grid gap-4">{feedback}<div className="cms-button-row">{children}{actions.map(action => <Button key={action} disabled={disabled || busy} variant={["reject", "archive"].includes(action) ? "destructive" : action === "clone" ? "outline" : "default"}
      onClick={async event => { const button = event.currentTarget; if (beforeAction && !await beforeAction(action)) return; trigger.current = button; setConfirm(action); }}>{titles[action]}</Button>)}</div></CardContent></Card>
    <AlertDialog open={Boolean(confirm)} onOpenChange={open => { if (!open) setConfirm(null); }}><AlertDialogContent onCloseAutoFocus={event => {
      event.preventDefault(); if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus(); else section.current?.focus();
    }}><AlertDialogHeader><AlertDialogTitle>{titles[confirm] ?? "Konfirmasi tindakan"}</AlertDialogTitle>
      <AlertDialogDescription>{titles[confirm]} untuk katalog versi {revision.version}? Konten live mengikuti revisi yang disetujui Owner.</AlertDialogDescription>
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction disabled={busy || disabled} onClick={execute}>Konfirmasi</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
};
export default CatalogActions;
