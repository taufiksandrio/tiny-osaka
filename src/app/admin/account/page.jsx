import Link from "next/link";
import { requireAdmin } from "@/server/auth/access.mjs";
import PasswordForm from "@/features/cms/auth/PasswordForm";
import SecurityForm from "@/features/cms/auth/SecurityForm";

export const metadata = { title: "Akun" };

const AccountPage = async () => {
  const actor = await requireAdmin();
  return <main className="auth-panel container" id="main-content" tabIndex={-1}>
    <h1>Akun</h1>
    <section aria-labelledby="password-title">
      <h2 id="password-title">Ganti password</h2>
      <PasswordForm />
    </section>
    {actor.role === "owner" && <section aria-labelledby="mfa-title">
      <h2 id="mfa-title">Keamanan akun Owner</h2>
      <SecurityForm enabled={actor.twoFactorEnabled} />
    </section>}
    <p><Link href="/admin">Kembali ke CMS</Link></p>
  </main>;
};
export default AccountPage;
