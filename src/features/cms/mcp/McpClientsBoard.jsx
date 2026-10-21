"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import useMcpClients from "./useMcpClients";

const formatDate = iso => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

const McpClientsBoard = ({ initial }) => {
  const { clients, creating, busyId, announcement, error, create, revoke } = useMcpClients(initial);
  const [name, setName] = useState("");
  const [redirectUrisText, setRedirectUrisText] = useState("");
  const [pending, setPending] = useState(null);
  const submit = async event => {
    event.preventDefault();
    if (await create({ name, redirectUrisText })) { setName(""); setRedirectUrisText(""); }
  };
  return <div className="grid gap-6 p-4 md:p-6">
    <header>
      <h1 className="text-2xl font-semibold">Koneksi MCP</h1>
      <p className="mt-1 text-sm text-muted-foreground">Daftarkan aplikasi AI (klien MCP) yang boleh meminta izin Owner untuk membaca dan mengubah konten. Mencabut klien langsung membatalkan semua tokennya.</p>
    </header>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
    <Card>
      <CardHeader><CardTitle>Daftarkan klien baru</CardTitle><CardDescription>Klien publik tanpa secret. Redirect URI harus https atau loopback (localhost, 127.0.0.1, [::1]).</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid max-w-xl gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="mcp-name">Nama klien</Label>
            <Input id="mcp-name" value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mcp-redirects">Redirect URI (satu per baris, maksimal 5)</Label>
            <Textarea id="mcp-redirects" value={redirectUrisText} onChange={event => setRedirectUrisText(event.target.value)} rows={3} required spellCheck={false} autoComplete="off" placeholder="https://contoh.com/callback" />
          </div>
          <div><Button type="submit" disabled={creating}>{creating ? "Mendaftarkan..." : "Daftarkan klien"}</Button></div>
        </form>
      </CardContent>
    </Card>
    <section aria-labelledby="mcp-list-title" className="grid gap-3">
      <h2 id="mcp-list-title" className="text-lg font-semibold">Klien terdaftar</h2>
      {clients.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada klien terdaftar.</p> :
        <ul className="grid gap-3">
          {clients.map(client => {
            const disabled = Boolean(client.disabledAt);
            return <li key={client.clientId}>
              <Card>
                <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="grid gap-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{client.name}</h3>
                      {disabled ? <Badge variant="secondary">Dicabut</Badge> : <Badge variant="outline">{client.activeConnections} koneksi aktif</Badge>}
                    </div>
                    <p className="break-all text-muted-foreground">Client ID: <code>{client.clientId}</code></p>
                    <div><p className="text-muted-foreground">Redirect URI:</p>
                      <ul className="list-disc pl-5 break-all">{client.redirectUris.map(uri => <li key={uri}>{uri}</li>)}</ul></div>
                    <p className="text-muted-foreground">Dibuat {formatDate(client.createdAt)}{disabled && <> · Dicabut {formatDate(client.disabledAt)}</>}</p>
                  </div>
                  {!disabled && <Button type="button" variant="destructive" disabled={busyId === client.clientId} onClick={() => setPending(client)}>
                    {busyId === client.clientId ? "Mencabut..." : <>Cabut<span className="sr-only"> klien {client.name}</span></>}
                  </Button>}
                </CardContent>
              </Card>
            </li>;
          })}
        </ul>}
    </section>
    <AlertDialog open={Boolean(pending)} onOpenChange={open => { if (!open) setPending(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cabut klien {pending?.name}?</AlertDialogTitle>
          <AlertDialogDescription>Semua token klien ini langsung tidak berlaku dan koneksi aktif terputus. Klien harus didaftarkan ulang untuk dipakai lagi.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={() => { const target = pending; setPending(null); revoke(target); }}>Cabut klien</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
};
export default McpClientsBoard;
