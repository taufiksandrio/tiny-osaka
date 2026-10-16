import Link from "next/link";
import { requireAdmin } from "@/server/auth/access.mjs";
import SecurityForm from "@/features/cms/auth/SecurityForm";

const SecurityPage = async () => {
  const actor = await requireAdmin("owner");
  return <main className="auth-panel container" id="main-content" tabIndex={-1}>
    <h1>Keamanan akun Owner</h1><SecurityForm enabled={actor.twoFactorEnabled} />
    <p><Link href="/admin">Kembali ke CMS</Link></p>
  </main>;
};
export default SecurityPage;
