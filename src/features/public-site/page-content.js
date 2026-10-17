import { notFound } from "next/navigation";

const pageContent = {
  id: {
    home: "Beranda", breadcrumb: "Jejak halaman", preview: "PRATINJAU HALAMAN", backMenu: "Kembali ke menu", backGuides: "Semua panduan", toMenu: "Jelajahi contoh menu", sampleHeading: "Contoh tampilan menu", detailEyebrow: "DETAIL PRODUK CONTOH", detailNote: "Ini adalah contoh tata letak, bukan produk resmi yang dapat dipesan.",
    pages: {
      menu: { eyebrow: "JELAJAHI MENU", title: "Temukan ruang untuk favoritmu.", description: "Pratinjau daftar menu Tiny Osaka. Semua slot di bawah adalah contoh tata letak, bukan katalog resmi.", label: "Menu" },
      about: { eyebrow: "KENALAN DULU", title: "Sedikit tentang Tiny Osaka.", description: "Japanese street-food, delivery-only, di Bandung. Cerita lengkapnya sedang disiapkan.", label: "Tentang" },
      guides: { eyebrow: "CATATAN DARI DAPUR", title: "Kenali, lalu jelajahi.", description: "Ruang untuk panduan takoyaki, okonomiyaki, dan burger. Artikel di sini masih berupa template editorial.", label: "Panduan makanan" },
      promos: { eyebrow: "PROMO & EVENT", title: "Ruang untuk kabar berikutnya.", description: "Halaman pratinjau untuk informasi promo dan event Tiny Osaka yang telah diverifikasi.", label: "Promo & event" },
      location: { eyebrow: "LOKASI & LAYANAN", title: "Bandung, lewat layanan delivery.", description: "Tiny Osaka adalah restoran delivery-only di Bandung. Detail operasional di halaman ini masih menunggu verifikasi.", label: "Lokasi & layanan" },
    },
    product: {
      detailsHeading: "Informasi produk", pending: "Belum tersedia", fields: ["Nama produk resmi", "Harga", "Bahan & informasi alergen", "Varian, topping & modifier"], note: "Pilihan dan biaya tambahan belum ditampilkan karena aturan menu resmi belum diverifikasi.", related: "Slot contoh lainnya", relatedIntro: "Jelajahi contoh detail lain untuk meninjau tampilan katalog.",
    },
    about: {
      heading: "Dari Bandung, untuk dikenali lebih dekat.", body: "Tiny Osaka berfokus pada Japanese street-food dengan layanan delivery-only di Bandung. Website ini disiapkan untuk memperkenalkan menu dan mengarahkan pengunjung ke platform pemesanan resmi.", storyHeading: "Cerita lengkap akan hadir di sini.", storyBody: "Ruang ini disiapkan untuk cerita brand, foto asli, dan informasi yang telah dikonfirmasi. Belum ada klaim sejarah, penghargaan, atau ulasan pelanggan pada pratinjau ini.", serviceHeading: "Delivery-only", serviceBody: "Informasi jam operasional dan cakupan pengiriman akan ditambahkan setelah diverifikasi.", serviceLink: "Lihat informasi layanan",
    },
    guides: {
      heading: "Tiga topik untuk dijelajahi.", status: "TEMPLATE ARTIKEL", summary: "Pratinjau susunan panduan; isi artikel final belum tersedia.", read: "Lihat template panduan", titlePrefix: "Panduan", articleNote: "Template editorial untuk meninjau susunan artikel. Bukan resep atau deskripsi produk resmi Tiny Osaka.", image: "Foto atau video panduan belum tersedia", sections: [
        { title: "Mengenal topiknya", body: "Pengantar edukatif akan ditambahkan setelah riset dan peninjauan konten. Teks ini belum berisi penjelasan faktual tentang makanan." },
        { title: "Cerita dan cara menikmati", body: "Ruang untuk narasi, foto, atau video yang telah ditinjau. Klaim bahan, rasa, dan cara penyajian belum ditambahkan." },
        { title: "Hubungannya dengan menu Tiny Osaka", body: "Rekomendasi produk hanya akan ditautkan setelah produk dan informasinya tersedia serta diverifikasi." },
      ],
    },
    promos: { heading: "Belum ada informasi promo pada pratinjau ini.", body: "Halaman ini tidak menyatakan ada atau tidaknya promo aktif di platform merchant. Penawaran, periode, dan syarat belum dimuat.", infoHeading: "Informasi yang akan dilengkapi", fields: ["Nama dan detail penawaran", "Tanggal mulai dan berakhir", "Syarat, ketentuan, dan platform resmi"], note: "Belum ada diskon, kode promo, atau tanggal event yang diumumkan di sini." },
    location: { heading: "Informasi sebelum memesan", entries: [
      { label: "Kota", value: "Bandung, Indonesia" }, { label: "Layanan", value: "Delivery-only" }, { label: "Alamat", value: "Menunggu verifikasi" }, { label: "Jam operasional", value: "Menunggu verifikasi" }, { label: "Cakupan pengiriman", value: "Menunggu verifikasi" },
    ], note: "Tidak ada petunjuk kunjungan atau peta pada pratinjau ini. Alamat dan informasi layanan akan ditambahkan setelah dikonfirmasi." },
  },

};

export const getPageContent = (locale) => {
  if (!Object.hasOwn(pageContent, locale)) notFound();
  return pageContent[locale];
};

export const getPageMetadata = (locale, page) => {
  const { title, description } = getPageContent(locale).pages[page];
  return { title: `${title} | Tiny Osaka`, description };
};
