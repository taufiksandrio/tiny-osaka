import Link from "next/link";
import ResetForm from "@/features/cms/auth/ResetForm";

const ResetPage = () => {
  return <main className="auth-panel container" id="main-content" tabIndex={-1}>
    <h1>Reset password</h1><ResetForm /><Link href="/admin/login">Kembali ke login</Link>
  </main>;
};
export default ResetPage;
