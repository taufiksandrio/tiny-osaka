"use client";
const AdminError = ({ reset }) => <main className="auth-panel container" id="main-content" tabIndex={-1}>
  <h1>Layanan CMS sementara tidak tersedia</h1><button className="button button-red" onClick={reset}>Coba lagi</button>
</main>;
export default AdminError;
