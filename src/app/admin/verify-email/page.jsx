import Link from "next/link";
import VerificationForm from "@/features/cms/auth/VerificationForm";
const VerifyPage = () => <main className="auth-panel container" id="main-content" tabIndex={-1}>
  <h1>Verifikasi email</h1><VerificationForm /><Link href="/admin/login">Kembali ke login</Link>
</main>;
export default VerifyPage;
