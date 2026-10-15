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
  en: {
    home: "Home", breadcrumb: "Breadcrumb", preview: "PAGE PREVIEW", backMenu: "Back to menu", backGuides: "All guides", toMenu: "Explore the sample menu", sampleHeading: "Sample menu layouts", detailEyebrow: "SAMPLE PRODUCT DETAILS", detailNote: "This is a layout sample, not an official product available to order.",
    pages: {
      menu: { eyebrow: "EXPLORE THE MENU", title: "Make room for a new favorite.", description: "A preview of the Tiny Osaka menu layout. Every slot below is a design sample, not an official catalog item.", label: "Menu" },
      about: { eyebrow: "A LITTLE INTRODUCTION", title: "Meet Tiny Osaka.", description: "Japanese street food, delivery-only, in Bandung. Our full story is being prepared.", label: "About" },
      guides: { eyebrow: "NOTES FROM THE KITCHEN", title: "Get to know your next discovery.", description: "A space for takoyaki, okonomiyaki, and burger guides. These pages are still editorial templates.", label: "Food guides" },
      promos: { eyebrow: "PROMOS & EVENTS", title: "A place for the next update.", description: "A page preview for verified Tiny Osaka promotions and events.", label: "Promos & events" },
      location: { eyebrow: "LOCATION & SERVICE", title: "Bandung, through delivery.", description: "Tiny Osaka is a delivery-only restaurant in Bandung. Operational details on this page are awaiting verification.", label: "Location & service" },
    },
    product: {
      detailsHeading: "Product information", pending: "Not yet available", fields: ["Official product name", "Price", "Ingredients & allergen information", "Variants, toppings & modifiers"], note: "Options and additional costs are not shown because the official menu rules have not been verified.", related: "More sample slots", relatedIntro: "Explore other sample detail pages to review the catalog layout.",
    },
    about: {
      heading: "A closer look, from Bandung.", body: "Tiny Osaka focuses on Japanese street food with a delivery-only service in Bandung. This website is being prepared to introduce the menu and direct visitors to official ordering platforms.", storyHeading: "Our full story will live here.", storyBody: "This space is reserved for our brand story, original photographs, and confirmed information. This preview includes no claims about our history, awards, or customer reviews.", serviceHeading: "Delivery-only", serviceBody: "Opening hours and delivery coverage will be added after verification.", serviceLink: "View service information",
    },
    guides: {
      heading: "Three topics to explore.", status: "ARTICLE TEMPLATE", summary: "A preview of the guide structure; final article content is not yet available.", read: "View guide template", titlePrefix: "Guide to", articleNote: "An editorial template for reviewing the article layout. This is not a recipe or an official Tiny Osaka product description.", image: "Guide photograph or video pending", sections: [
        { title: "An introduction", body: "An educational introduction will be added after research and content review. This placeholder does not yet provide factual information about the food." },
        { title: "Stories and ways to enjoy", body: "A space for reviewed storytelling, photographs, or video. Ingredient, flavor, and serving claims have not been added." },
        { title: "Connecting with the Tiny Osaka menu", body: "Product recommendations will only be linked once products and their information are available and verified." },
      ],
    },
    promos: { heading: "No promotion information in this preview yet.", body: "This page does not indicate whether promotions are active on merchant platforms. Offers, dates, and terms have not been added.", infoHeading: "Details to come", fields: ["Offer name and details", "Start and end dates", "Terms, conditions, and official platform"], note: "No discount, promo code, or event date is announced here." },
    location: { heading: "Before you order", entries: [
      { label: "City", value: "Bandung, Indonesia" }, { label: "Service", value: "Delivery-only" }, { label: "Address", value: "Awaiting verification" }, { label: "Opening hours", value: "Awaiting verification" }, { label: "Delivery coverage", value: "Awaiting verification" },
    ], note: "This preview includes no visiting directions or map. Address and service details will be added once confirmed." },
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
