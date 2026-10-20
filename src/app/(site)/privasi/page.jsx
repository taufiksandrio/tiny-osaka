import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Kebijakan privasi | Tiny Osaka",
  description: "Informasi tentang pengukuran kunjungan dan klik tombol pesan di situs Tiny Osaka.",
};

// Describes only what the site actually does. Bracketed [ISI OLEH PEMILIK: ...] markers are placeholders the owner must
// fill (and have legally reviewed) before launch; nothing here asserts legal compliance or invents entity details.
const Todo = ({ children }) => <mark className="font-semibold">[ISI OLEH PEMILIK: {children}]</mark>;

const PrivasiPage = () => (
  <main id="main-content" tabIndex={-1}>
    <section className="site-section container" aria-labelledby="privasi-heading">
      <Card className="content-card"><CardContent>
        <div className="site-prose">
          <h1 id="privasi-heading">Kebijakan privasi</h1>
          <h2>Pengelola situs</h2>
          <p>Nama badan usaha atau pengelola: <Todo>nama entitas resmi</Todo>.</p>
          <p>Kontak untuk pertanyaan privasi: <Todo>email atau kanal kontak resmi</Todo>.</p>
          <h2>Data yang kami ukur</h2>
          <p>Situs ini tidak menyediakan akun pengunjung, pembayaran, atau formulir yang meminta data pribadi. Jika Anda memilih
            Terima pada spanduk pengukuran, kami memakai Google Analytics 4 untuk memahami jumlah dan pola kunjungan halaman.</p>
          <p>Kami juga mengukur klik pada tombol aplikasi pemesanan (GoFood, GrabFood) sebagai tanda niat memesan. Data klik hanya
            memuat nama aplikasi, nama menu, posisi tombol, dan alamat halaman. Pengukuran ini tidak menyatakan bahwa pesanan selesai,
            dan kami tidak mengirim nilai uang, nama, email, atau tautan pemesanan.</p>
          <h2>Persetujuan Anda</h2>
          <p>Tanpa persetujuan, situs tidak memuat skrip Google dan tidak mengirim data pengukuran. Pilihan Anda disimpan di peramban
            Anda (penyimpanan lokal) agar tidak ditanyakan terus-menerus. Anda dapat mengubah atau mencabutnya kapan saja lewat
            tautan Pengaturan privasi di bagian bawah halaman. Kami tidak memakai fitur iklan atau personalisasi iklan.</p>
          <h2>Aplikasi pemesanan dan video</h2>
          <p>Tombol pesan membuka aplikasi pihak ketiga di tab baru. Setelah itu, kebijakan privasi aplikasi tersebut berlaku.
            Video YouTube baru dimuat setelah Anda menekannya.</p>
          <h2>Penyimpanan data</h2>
          <p>Masa simpan data Google Analytics: <Todo>durasi retensi yang dipilih pemilik</Todo>.</p>
          <h2>Hak Anda dan pembaruan</h2>
          <p>Cara mengajukan permintaan terkait data Anda: <Todo>prosedur dan kontak, setelah tinjauan hukum</Todo>.</p>
          <p>Terakhir diperbarui: <Todo>tanggal</Todo>.</p>
        </div>
      </CardContent></Card>
    </section>
  </main>
);

export default PrivasiPage;
