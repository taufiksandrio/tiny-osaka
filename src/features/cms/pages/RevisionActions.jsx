"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cmsRequest } from "./client";
const titles = { submit: "Kirim untuk review", approve: "Setujui revisi", reject: "Tolak revisi", publish: "Terbitkan revisi", archive: "Arsipkan revisi", clone: "Buat draft dari revisi ini" };
export const CreateDraft = ({ pageKey }) => {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div><button type="button" disabled={busy} onClick={async () => {
    setBusy(true); setMessage("");
    try { const row = await cmsRequest("", { pageKey }); router.push(`/admin/pages/${pageKey}/${row.id}`); router.refresh(); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }}>Buat draft baru</button><p role="status">{message}</p></div>;
};
const RevisionActions = ({ revision, role, disabled, onChange, onMessage, onBusy }) => {
  const router = useRouter(), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null);
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
  return <section aria-label="Tindakan revisi"><h2>Tindakan revisi</h2>
    <div className="cms-actions">{actions.map(action => <button type="button" key={action} disabled={disabled || busy}
      onClick={() => setConfirm(action)}>{titles[action]}</button>)}</div>
    {confirm && <div role="group" aria-label="Konfirmasi tindakan"><p>{titles[confirm]} untuk versi {revision.version} ini?</p>
      <button type="button" disabled={busy || disabled} onClick={() => execute(confirm)}>Konfirmasi</button>
      <button type="button" onClick={() => setConfirm(null)}>Batal</button></div>}
  </section>;
};
export default RevisionActions;
