"use client";

const PublicError = ({ reset }) => (
  <main id="main-content" className="container page-section" tabIndex={-1}>
    <h1>Konten sementara tidak tersedia</h1>
    <button className="button button-red" onClick={reset}>Coba lagi</button>
  </main>
);

export default PublicError;
