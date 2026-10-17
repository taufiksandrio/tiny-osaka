"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cmsRequest } from "./client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Plus, LoaderCircle } from "lucide-react";
const titles = { submit: "Kirim untuk review", approve: "Setujui revisi", reject: "Tolak revisi", publish: "Terbitkan revisi", archive: "Arsipkan revisi", clone: "Buat draft dari revisi ini" };
export const CreateDraft = ({ pageKey }) => {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div><Button type="button" disabled={busy} onClick={async () => {
    setBusy(true); setMessage("");
    try { const row = await cmsRequest("", { pageKey }); router.push(`/admin/pages/${pageKey}/${row.id}`); router.refresh(); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Buat draft baru</Button><p role="status" className="mt-2 text-sm text-destructive">{message}</p></div>;
};
const RevisionActions = ({ revision, role, disabled, onChange, onMessage, onBusy }) => {
  const router = useRouter(), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null);
  const trigger = useRef(null), section = useRef(null);
  const actions = ["clone"];
  if (revision.status === "draft") actions.push("submit");
  if (role === "owner") {
    if (revision.status === "review") actions.push("approve", "reject");
    if (revision.status === "approved") actions.push("publish", "archive");
    if (["rejected", "published"].includes(revision.status) && !revision.isLive) actions.push("archive");
  }
  const execute = async action => {
    setBusy(true); onBusy(true); onMessage(""); setConfirm(null);
    const input = action === "clone" ? { action, sourceRevisionId: revision.id, expectedSourceVersion: revision.version } :
      { action, revisionId: revision.id, expectedVersion: revision.version,
        ...(action === "submit" ? {} : { expectedHash: revision.contentHash }) };
    try {
      const row = await cmsRequest(`/${revision.id}/actions`, input);
      if (action === "clone") router.push(`/admin/pages/${row.pageKey}/${row.id}`);
      else { onChange(row); onMessage("Tindakan berhasil: " + titles[action] + "."); }
      router.refresh();
    } catch (error) { onMessage(error.message); } finally { setBusy(false); onBusy(false); }
  };
  return <section ref={section} tabIndex={-1} aria-label="Tindakan revisi"><Card className="shadow-none"><CardHeader><h2>Tindakan revisi</h2>
    <CardDescription>Simpan perubahan sebelum melanjutkan. Tindakan berlaku untuk revisi dan versi ini.</CardDescription></CardHeader><CardContent>
    <div className="cms-actions">{actions.map(action => <Button type="button" key={action} disabled={disabled || busy}
      variant={["reject", "archive"].includes(action) ? "destructive" : action === "clone" ? "outline" : "default"}
      onClick={event => { trigger.current = event.currentTarget; setConfirm(action); }}>{titles[action]}</Button>)}</div>
    </CardContent></Card>
    <AlertDialog open={Boolean(confirm)} onOpenChange={open => { if (!open) setConfirm(null); }}>
      <AlertDialogContent onCloseAutoFocus={event => {
        event.preventDefault();
        if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus();
        else section.current?.focus();
      }}><AlertDialogHeader><AlertDialogTitle>{titles[confirm] ?? "Konfirmasi tindakan"}</AlertDialogTitle>
        <AlertDialogDescription>{titles[confirm]} untuk versi {revision.version} ini? Persetujuan dan publikasi tetap mengikuti izin akun Anda.</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel>
        <AlertDialogAction disabled={busy || disabled} onClick={() => execute(confirm)}>Konfirmasi</AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
};
export default RevisionActions;
