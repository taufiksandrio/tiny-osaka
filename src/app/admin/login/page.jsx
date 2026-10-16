import LoginForm from "@/features/cms/auth/LoginForm";

export const metadata = { title: "Masuk | Tiny Osaka CMS" };
const LoginPage = () => <main className="auth-panel container" id="main-content" tabIndex={-1}>
  <h1>Masuk ke CMS</h1><p>Hanya untuk akun internal Owner dan Staff.</p><LoginForm />
</main>;
export default LoginPage;
