"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cmsRequest } from "./client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Plus, LoaderCircle } from "lucide-react";
const titles = { submit: "Kirim untuk review", approve: "Setujui", reject: "Tolak revisi", publish: "Terbitkan revisi", archive: "Arsipkan revisi", clone: "Buat draft dari revisi ini" };
export const CreateDraft = ({ pageKey }) => {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div><Button type="button" disabled={busy} onClick={async () => {
    setBusy(true); setMessage("");
    try { const row = await cmsRequest("", { pageKey }); router.push(`/admin/pages/${pageKey}/${row.id}`); router.refresh(); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Buat draft baru</Button><p role="status" className="mt-2 text-sm text-destructive">{message}</p></div>;
};
const RevisionActions = ({ revision, role, disabled, onChange, onMessage, onBusy, children, feedback, beforeAction, dueAt }) => {
  const router = useRouter(), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null);
  const trigger = useRef(null), section = useRef(null);
  const actions = ["clone"];
  if (revision.status === "draft") actions.push(role === "owner" ? "approve" : "submit");
  if (role === "owner") {
    if (revision.status === "review") actions.push("approve", "reject");
    if (revision.status === "approved") actions.push("approve", "archive");
    if (["rejected", "published"].includes(revision.status) && !revision.isLive) actions.push("archive");
  }
  const execute = async action => {
    setBusy(true); onBusy(true); onMessage(""); setConfirm(null);
    const input = action === "clone" ? { action, sourceRevisionId: revision.id, expectedSourceVersion: revision.version } :
      { action, revisionId: revision.id, expectedVersion: revision.version,
        ...(action === "submit" ? {} : { expectedHash: revision.contentHash, ...(action === "approve" && dueAt ? { dueAt } : {}) }) };
    try {
      const row = await cmsRequest(`/${revision.id}/actions`, input);
      if (action === "clone") router.push(`/admin/pages/${row.pageKey}/${row.id}`);
      else { onChange(row); onMessage(action === "approve" ? (row.status === "published" ? "Disetujui. Konten baru sudah tampil di website." : "Disetujui. Konten akan tampil sesuai jadwal publikasi.") : "Tindakan berhasil: " + titles[action] + "."); }
      router.refresh();
    } catch (error) { onMessage(error.message); } finally { setBusy(false); onBusy(false); }
  };
  return <section ref={section} tabIndex={-1} aria-label="Tindakan revisi"><Card className="shadow-none"><CardHeader><h2>Tindakan revisi</h2>
    <CardDescription>{disabled ? "Simpan semua perubahan sebelum menjalankan tindakan revisi." :
      revision.status === "draft" ? (role === "owner" ? "Setujui untuk langsung menampilkan konten, atau pilih jadwal publikasi." : "Kirim draft yang lengkap untuk review Owner.") : "Tindakan berlaku hanya untuk revisi dan versi yang sedang dibuka."}</CardDescription></CardHeader><CardContent className="space-y-4">{feedback}
    <div className="cms-actions cms-button-row">{children}{actions.map(action => <Button type="button" key={action} disabled={disabled || busy}
      variant={["reject", "archive"].includes(action) ? "destructive" : action === "clone" ? "outline" : "default"}
      onClick={event => { if (beforeAction && !beforeAction(action)) return; trigger.current = event.currentTarget; setConfirm(action); }}>{titles[action]}</Button>)}</div>
    </CardContent></Card>
    <AlertDialog open={Boolean(confirm)} onOpenChange={open => { if (!open) setConfirm(null); }}>
      <AlertDialogContent onCloseAutoFocus={event => {
        event.preventDefault();
        if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus();
        else section.current?.focus();
      }}><AlertDialogHeader><AlertDialogTitle>{titles[confirm] ?? "Konfirmasi tindakan"}</AlertDialogTitle>
        <AlertDialogDescription>{titles[confirm]} untuk versi {revision.version} ini? Tanpa jadwal, persetujuan langsung menggantikan konten publik.</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel>
        <AlertDialogAction disabled={busy || disabled} onClick={() => execute(confirm)}>Konfirmasi</AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
};
export default RevisionActions;
