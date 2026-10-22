import { requireAdmin } from "@/server/auth/access.mjs";
import { getMcp } from "@/server/mcp/runtime.mjs";
import { UPLOAD_MESSAGES, uploadMessage } from "@/server/mcp/uploads.mjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import UploadForm from "@/features/cms/mcp/UploadForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unggah foto", robots: { index: false, follow: false }, referrer: "no-referrer" };

const describeUpload = async (token, actor) => {
  try { return await getMcp().uploads.describe(token, actor); } catch { return { state: "unavailable" }; }
};
const TITLES = { done: "Foto berhasil diunggah", used: "Token sudah dipakai", expired: "Tautan kedaluwarsa", rejected: "Unggahan ditolak",
  invalid: "Tautan unggah tidak valid", limited: "Terlalu banyak percobaan", unavailable: "Layanan belum tersedia" };

// Owner-only page opened from the link Claude gives. The form posts to the same single-use route as the agent path, with the
// CMS Origin check; the outcome is read back from the database after the redirect. Nothing is consumed by viewing the page.
const UploadPage = async ({ params, searchParams }) => {
  const actor = await requireAdmin("owner");
  const { token } = await params;
  const { r } = await searchParams;
  const upload = await describeUpload(token, actor);
  const notice = typeof r === "string" && r !== "ok" ? uploadMessage(r) : null;
  const detail = upload.state === "rejected" ? uploadMessage(upload.failureCode) ?? UPLOAD_MESSAGES.REJECTED
    : upload.state === "expired" ? UPLOAD_MESSAGES.TOKEN_EXPIRED : upload.state === "used" ? "Foto untuk permintaan ini sudah diunggah lewat jalur lain." : null;
  return <main id="main-content" tabIndex={-1} className="mx-auto grid max-w-xl gap-4 p-4 md:p-6">
    <Card>
      <CardHeader>
        <CardTitle className="text-xl"><h1>{upload.state === "ready" ? "Unggah foto" : TITLES[upload.state] ?? "Unggah foto"}</h1></CardTitle>
        <CardDescription>{upload.state === "ready" ? "Pilih satu foto dari kamera atau galeri. Format JPG, PNG, atau WebP, maksimal 10 MB." : detail ?? "Minta Claude membuat permintaan unggah baru bila perlu."}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {notice && <Alert variant="destructive" role="alert"><AlertDescription>{notice}</AlertDescription></Alert>}
        {upload.state === "ready" && <UploadForm action={`/api/mcp/upload/${token}`} target={upload.target} />}
        {upload.state === "done" && <Alert role="status"><AlertDescription>Foto sudah tersimpan di pustaka media. Kembali ke Claude untuk melanjutkan.</AlertDescription></Alert>}
      </CardContent>
    </Card>
  </main>;
};
export default UploadPage;
