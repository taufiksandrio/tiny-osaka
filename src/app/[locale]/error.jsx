"use client";

import { useParams } from "next/navigation";

const PublicError = ({ reset }) => {
  const { locale } = useParams();
  return <main id="main-content" className="container page-section" tabIndex={-1}>
    <h1>{locale === "id" ? "Konten sementara tidak tersedia" : "Content is temporarily unavailable"}</h1>
    <button className="button button-red" onClick={reset}>{locale === "id" ? "Coba lagi" : "Try again"}</button>
  </main>;
};

export default PublicError;
