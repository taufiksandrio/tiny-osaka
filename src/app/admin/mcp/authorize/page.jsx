import { requireAdmin } from "@/server/auth/access.mjs";
import { getMcp } from "@/server/mcp/runtime.mjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ConsentForm from "@/features/cms/mcp/ConsentForm";

const SCOPE_LABELS = {
  "mcp:read": "Membaca halaman dan katalog",
  "mcp:write": "Mengubah halaman dan katalog (perubahan langsung tayang)",
};
const describeRequest = async searchParams => {
  try { return await getMcp().oauth.describe(searchParams); } catch { return null; }
};
const AuthorizePage = async ({ searchParams }) => {
  await requireAdmin("owner");
  const request = await describeRequest(await searchParams);
  return <main id="main-content" tabIndex={-1} className="mx-auto grid max-w-xl gap-4 p-4 md:p-6">
    {request ? <Card>
      <CardHeader>
        <CardTitle className="text-xl"><h1>Izinkan akses ke akun Owner?</h1></CardTitle>
        <CardDescription><strong>{request.clientName}</strong> meminta izin untuk bertindak atas nama Anda di CMS Tiny Osaka.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <section aria-labelledby="scope-title">
          <h2 id="scope-title" className="text-sm font-semibold">Izin yang diminta</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {request.scope.map(item => <li key={item}>{SCOPE_LABELS[item] ?? item} <code className="text-muted-foreground">({item})</code></li>)}
          </ul>
        </section>
        <section aria-labelledby="redirect-title">
          <h2 id="redirect-title" className="text-sm font-semibold">Setelah keputusan, Anda dikembalikan ke</h2>
          <p className="mt-2 break-all text-sm"><code>{request.redirectUri}</code></p>
        </section>
        <p className="text-sm text-muted-foreground">Setujui hanya jika Anda mengenali aplikasi ini. Anda dapat mencabut akses kapan saja di halaman Koneksi MCP.</p>
        <ConsentForm form={request.form} />
      </CardContent>
    </Card> : <Card>
      <CardHeader>
        <CardTitle><h1>Permintaan izin tidak valid</h1></CardTitle>
        <CardDescription>Permintaan ini tidak dikenali atau sudah tidak berlaku. Tutup halaman ini lalu ulangi proses dari aplikasi klien.</CardDescription>
      </CardHeader>
    </Card>}
  </main>;
};
export default AuthorizePage;
