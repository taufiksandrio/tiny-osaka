# Spec: Redesain halaman publik (marketing + blog) dengan shadcn UI

Status: MENUNGGU PERSETUJUAN USER. Belum ada kode yang diubah.
Tanggal: 2026-10-18. Penulis: PM. Branch dokumen: chore/agents-md-adr-037-038 (implementasi nanti di branch fitur baru dari main terbaru).
Permintaan user: "ubah halaman marketing atau blog tiny osaka dengan shadcn ui"; cakupan "halaman selain di folder admin"; pendekatan "struktur baru aja pakai shadcn ui".

## 1. Masalah dan tujuan

Masalah (temuan baca-saja):
- Hanya beranda (`HomeContent.jsx`) yang sudah memakai shadcn (Card, Button, Badge) dengan token yang di-scope `.home-theme` di `src/styles/home.css`. Semua halaman publik lain masih memakai CSS legacy di `src/styles/globals.css` (`.hero`, `.menu-card`, `.page-intro`, `.ordering-section`, `.info-list`, `.empty-state`, `.article-section`, dst.) dan Arial sebagai font.
- Semua halaman terbit selain beranda dirender oleh satu komponen generik `PublishedPage` di `src/features/public-site/components/PublishedContent.jsx`: judul, ringkasan, rich text, media, lalu blok khusus (katalog, about, location, daftar guide). Hasilnya datar, tidak ada hero/section/kartu yang membedakan marketing dan blog.
- Ada dua mode render per halaman: mode pratinjau fixture (`usesPublishedContent()` false: `content.js`, `page-content.js`, `fixtures/menu.js`, `fixtures/guides.js`, `MenuCard`, `PageIntro`, banner "PRATINJAU") dan mode terbit (konten CMS). Kedua mode harus ikut direstruktur karena suite `tests/e2e` berjalan pada mode fixture dan `tests/published-e2e` pada mode terbit.

Tujuan: tampilan publik yang konsisten, mobile-first, aksesibel, dibangun dari komponen shadcn (Radix, JSX) dengan token desain tetap di kode, tanpa mengubah perilaku konten, RBAC, skema DB, atau klaim bisnis.

## 2. Keputusan terkait (sudah disetujui, dipatuhi spec ini)

- ADR-028/029: shadcn/Radix adalah arah UI standar untuk halaman berikutnya. ADR-031: beranda memakai shadcn Card/Button/Badge + token ter-scope.
- ADR-034/038: situs hanya Indonesia, URL tanpa prefix bahasa; `/en` 404, `/id` 308; tanpa hreflang; canonical/sitemap menunggu Phase 3 (halaman tetap `noindex, nofollow` seperti sekarang).
- ADR-036/037: halaman disimpan langsung tayang; katalog berupa kartu; link order hanya disimpan, TIDAK tampil publik.
- AGENTS.md: token desain tetap di kode (bukan owner-editable), tanpa `Restaurant`/`LocalBusiness` schema, tanpa dependency baru tanpa bukti, tanpa alamat/harga/klaim promosi/URL menu yang tak terverifikasi, konten publik server-rendered, Lighthouse mobile >= 90 target QA (bukan janji).
- CONTENT_AND_UX.md: logo dan foto asli Tiny Osaka otomatis menjadi acuan; merek Jepang lain hanya moodboard, jangan disalin. Tidak ada keputusan palet/font baru yang ditemukan.

Tidak ditemukan konflik dengan keputusan yang disetujui. Konflik hanya akan muncul bila scope diperluas (lihat out of scope).

## 3. Inventaris kondisi sekarang

Halaman publik (route group `src/app/(site)`; semua `force-dynamic`, `lang="id"`, `robots noindex`):

| Jenis | Rute | Template/field CMS (`src/server/pages/templates.mjs`) |
|---|---|---|
| Marketing | `/` (home) | eyebrow, title, summary, body, menuTitle, menuIntro, aboutTitle, aboutBody, primaryCtaLabel, secondaryCtaLabel, seo* + media |
| Marketing | `/about` | common + storyHeading, storyBody, serviceHeading, serviceBody |
| Marketing | `/promos` | common (eyebrow, title, summary, body, seo*) + media |
| Marketing | `/location` | common + city, service, hours, coverage |
| Katalog | `/menu`, `/menu/<slug>` | menu: common; kartu produk dari katalog (nama, deskripsi, harga, gambar 4:3) |
| Blog | `/guides` | common + daftar 3 guide (judul saja, tautan) |
| Blog | `/guides/<slug>` (takoyaki, okonomiyaki, burger; 3 identitas tetap `guide-*`) | common (template `guide`) + media |

Komponen yang ada:
- `src/components/ui`: alert-dialog, alert, badge, breadcrumb, button, card, checkbox, dialog, dropdown-menu, input, label, native-select, separator, sheet, table, textarea (gaya new-york, JSX, impor dari paket umbrella `radix-ui`). `components.json` ada (`tsx:false`, ikon lucide, alias `@/components`, `@/lib/utils`), tetapi `tailwind.css` menunjuk `src/styles/admin.css`. `src/lib/utils.js` ada (`cn`).
- Belum ada: accordion, aspect-ratio, navigation-menu, skeleton, tabs.
- Dependency terpasang: `radix-ui` 1.8.1 (umbrella, sudah memuat Accordion, AspectRatio, NavigationMenu, dst.), `class-variance-authority` 0.7.1, `lucide-react` 1.58.0, `tailwind-merge`, `clsx`, `tw-animate-css`, Tailwind 4.3.3.
- Token: `globals.css` `@theme` hanya `osaka-cream #faf5eb`, `osaka-red #b52f24`, `osaka-ink #25251f`; token semantik shadcn untuk publik hanya ada di `.home-theme` (`home.css`: background, foreground, card, primary, secondary, muted, accent, border, input, ring, radius). Variabel admin di-scope `.admin-root`. Font: Arial (tanpa `next/font`).
- `SiteHeader` dan `SiteFooter` masih CSS legacy; header tidak punya menu mobile (4 tautan: Menu, Tentang, Promo & event, Pesan -> `/#ordering`); footer: Panduan, Promo, Lokasi.
- `PublicRichText.jsx`: renderer server-side murni (paragraph, heading h2/h3, list, bold/italic, tautan internal). `PublishedMedia.jsx` dan `ProductCardImage.jsx` adalah client component (consent YouTube, fallback gambar).
- `PagePreview.jsx` di `src/features/cms/pages/` memakai `HomeContent` (mode `preview`) di editor CMS. Perubahan `HomeContent` memengaruhi pratinjau editor.

## 4. Scope

Dalam scope (hanya `src/app/(site)`, `src/app/global-not-found.jsx` bila perlu, `src/features/public-site`, `src/components/ui` (penambahan), `src/styles`):
1. Fondasi tema publik: satu scope token shadcn untuk seluruh situs publik (mis. `.site-root` pada `<body>` layout `(site)`), memakai NILAI token yang sudah ada (tidak ada warna/brand baru). `.home-theme` dilebur ke scope ini.
2. Shell: `SiteHeader` (logo, navigasi utama, menu mobile), `SiteFooter`, skip link, banner pratinjau.
3. Halaman marketing: home, about, promos, location.
4. Halaman katalog publik: menu dan detail produk (disertakan karena "semua halaman selain admin"; hanya presentasi kartu yang sudah ada).
5. Halaman blog: guides (indeks) dan guides/<slug>.
6. Kedua mode (pratinjau fixture dan terbit) dengan struktur yang sama.
7. Pembaruan selector pada test e2e yang terdampak (tugas QA).

## 5. Out of scope

- Seluruh `src/app/admin`, `src/features/cms`, `src/app/api` (kecuali tidak ada perubahan; `PagePreview` hanya ikut berubah lewat `HomeContent`).
- Tampilan publik link order GoFood/GrabFood/ShopeeFood (spec lanjutan terpisah, tertahan daftar host resmi); `OrderingNotice` tetap tidak berisi tautan dan teks "Tautan belum tersedia"/setara.
- Perubahan skema DB, migrasi, field template CMS baru, perubahan RBAC/API/validasi, workflow simpan halaman.
- Fitur baru blog (paginasi, kategori, tag, pencarian, tanggal terbit, penulis, estimasi waktu baca), FAQ, galeri, testimoni, ulasan, peta, formulir. Lihat pertanyaan terbuka.
- Canonical, sitemap, robots tuning, JSON-LD apa pun (`Restaurant`/`LocalBusiness` dilarang), hreflang, ubah `noindex`.
- GA4/event, checkout, harga baru, promo/diskon baru, alamat, jam, cakupan antar, klaim bahan.
- Mode gelap, ganti font web (kecuali disetujui di pertanyaan terbuka), aset/logo/foto baru, ilustrasi AI baru.
- Dependency baru (lihat bagian 9).

## 6. Struktur baru per halaman (komponen shadcn)

Prinsip bersama:
- Satu `<h1>` per halaman; urutan heading h1 -> h2 -> h3 tanpa lompat. Isi rich text CMS hanya h2/h3 (validator menolak level 1); karena itu judul section komponen memakai h2 dan h3 untuk kartu, dan heading di dalam rich text diturunkan secara konsisten (h2 -> h2 di bawah hero; di halaman dengan section berjudul, rich text diletakkan di dalam section tanpa menambah loncatan).
- Server Component sebisa mungkin; "use client" hanya untuk menu mobile (Sheet) dan media yang sudah client (`PublishedMedia`, `ProductCardImage`).
- Tidak ada teks bisnis baru. Salinan bawaan hanya label UI generik (mis. "Lihat menu", "Baca panduan") dan teks yang sudah ada di `content.js`/`page-content.js`/`PublishedContent.jsx`. Konten placeholder fixture tetap berlabel jelas "contoh/pratinjau".

Shell
- Header: `Button` (variant ghost/link) sebagai tautan, `Sheet` untuk menu mobile (pemicu tombol dengan label aksesibel "Buka menu", fokus kembali ke pemicu, latar inert), `Separator`. Desktop: nav inline. Tanpa `NavigationMenu` (tidak ada submenu; hindari JS tambahan). Tautan dan urutan tetap: Menu, Tentang, Promo & event, Pesan (`/#ordering`); `aria-label` "Navigasi utama" dipertahankan. Logo `/brand/tiny-osaka-logo.png` tetap.
- Footer: `Separator`, tautan Panduan/Promo/Lokasi, "Kembali ke atas"; `aria-label` "Halaman lainnya" dipertahankan.
- Banner pratinjau (mode fixture): `Alert` atau `Badge`, teks "PRATINJAU" tetap.
- Breadcrumb: komponen `breadcrumb.jsx` yang sudah ada menggantikan `PageIntro` (di halaman non-home: about, menu, detail menu, guides, guide detail, promos, location). `aria-label` "Jejak halaman" dipertahankan, item terakhir `aria-current="page"`.

Beranda (`/`) - sekarang: hero + prosa + 4 kartu menu + kartu tentang + media + OrderingNotice.
- Usulan: hero (Badge eyebrow, h1, ringkasan, 2 `Button` CTA, gambar `next/image` rasio 4:3 yang sudah ada dengan keterangan "ilustrasi/foto" tetap sesuai teks sekarang), section cerita (rich text), section menu unggulan (`Card` per produk, gambar rasio 4:3 via utilitas `aspect-[4/3]`, nama, deskripsi, harga; `Button` "Lihat seluruh menu"), section tentang (`Card`), strip CTA pesan (`OrderingNotice` tanpa tautan). `Separator` antar section.
- Gambar hero tetap `preload` (LCP) dan memakai file yang sudah ada; tidak ada gambar baru.

Tentang (`/about`) - sekarang: h1, ringkasan, rich text, dua h2 (story, service).
- Usulan: header halaman (breadcrumb, Badge eyebrow, h1, ringkasan), `Card` untuk "cerita" (storyHeading/storyBody) dan "layanan" (serviceHeading/serviceBody) dalam grid 2 kolom di desktop, 1 kolom di mobile; media di bawah. Bagian kosong tidak dirender (perilaku sekarang dipertahankan).

Promo (`/promos`) - sekarang: h1, ringkasan, rich text, media; mode fixture: panel kosong "belum ada informasi promo".
- Usulan: header halaman + satu `Card` konten rich text + media. Keadaan kosong memakai `Card` bergaris putus (pola yang sudah dipakai beranda) dengan teks yang sudah ada. TIDAK menambah kartu promo, diskon, tanggal, atau kode.

Lokasi (`/location`) - sekarang: `<dl>` city/service/hours/coverage (hanya yang terisi).
- Usulan: header + `Card` berisi `<dl>` (tetap `dl/dt/dd`, semantik), baris dipisah `Separator`; nilai hanya dari field CMS; mode fixture tetap menampilkan "Menunggu verifikasi". Tanpa peta, tanpa alamat jalan.

Menu (`/menu`) dan detail (`/menu/<slug>`) - sekarang: kartu `article.prose-panel` dengan judul-tautan, deskripsi, harga, gambar; detail: judul, deskripsi, harga, media.
- Usulan: grid `Card` responsif (1/2/3 kolom), gambar `aspect-[4/3]` (`ProductCardImage` dipertahankan: `fill`, `sizes`, `quality`, hanya kartu pertama `/menu` priority), nama sebagai tautan (target klik seluruh kartu via pseudo-element, hanya satu tautan per kartu agar tidak duplikat bagi pembaca layar), harga memakai `formatPrice`. Detail: breadcrumb, gambar besar, h1, harga (`Badge`/teks besar), deskripsi, `Button` "Kembali ke menu". Tidak menampilkan link order (lihat out of scope).

Blog - indeks (`/guides`) - sekarang: daftar `<ul>` tautan judul.
- Usulan: grid `Card` artikel (cover dari media gambar pertama guide bila ada, `aspect-[16/9]`; jika tidak ada, kartu tanpa gambar - tanpa placeholder palsu di mode terbit), `Badge` topik hanya dari judul/eyebrow field yang ada, judul h2/h3 tertaut, ringkasan (`summary`), `Button` variant link "Baca panduan" dengan teks sr-only berisi judul. Tidak ada paginasi/kategori (tiga artikel tetap).

Blog - artikel (`/guides/<slug>`) - sekarang: h1, ringkasan, rich text, media.
- Usulan: breadcrumb (Beranda > Panduan makanan > judul), `Badge` eyebrow, h1, ringkasan, media pembuka (rasio mengikuti aset, cegah CLS), kolom prosa `max-w-prose` dengan tipografi rich text konsisten (komponen `PublicRichText` diberi kelas tipografi yang sama untuk semua halaman), `Separator`, blok navigasi bawah: `Button` "Semua panduan" dan "Lihat menu". Tidak ada tanggal, penulis, waktu baca, artikel terkait otomatis (tidak ada datanya).

Komponen shadcn yang dibutuhkan dan statusnya:
- Sudah ada, dipakai: Button, Card, Badge, Separator, Breadcrumb, Sheet, Alert.
- Opsional, salin manual hanya jika disetujui: Accordion (hanya bila ada sumber FAQ; saat ini TIDAK ada field, jadi default tidak dipakai), Skeleton (tidak relevan: halaman server-rendered tanpa loading client; default tidak dipakai), AspectRatio (cukup utilitas Tailwind `aspect-*`; tidak ditambah), NavigationMenu (tidak perlu; Sheet + nav biasa).
- Jadi default: tidak ada file shadcn baru, kecuali mungkin penyesuaian varian di `button.jsx`/`card.jsx` yang bersama dengan admin (lihat risiko R3).

## 7. Dampak pada CMS (editor halaman)

- Tidak ada perubahan skema, migrasi, validator (`src/server/pages/validation.mjs`), template (`templates.mjs`), hash konten, atau API. Format rich text (paragraph, heading level 2/3, list, bold/italic, tautan internal) tidak berubah, jadi konten yang sudah tersimpan tetap valid dan tampil.
- Dampak visual: pratinjau Beranda di editor (`PagePreview.jsx` -> `HomeContent preview`) berubah mengikuti redesain; pratinjau halaman lain di editor dicek agar tidak rusak (QA). Editor admin sendiri tidak disentuh.
- Bila redesain ternyata membutuhkan field baru (mis. gambar sampul guide, FAQ), itu di luar spec ini: butuh spec dan persetujuan terpisah, termasuk bila memicu migrasi. Ditandai di pertanyaan terbuka.

## 8. Aksesibilitas, SEO, performa

Aksesibilitas (target WCAG 2.2 AA, sama dengan suite axe saat ini):
- Satu h1 per halaman, tanpa lompat level, tanpa id duplikat, tanpa overflow horizontal pada 320 px.
- Kontras: nilai token yang ada sudah dipakai di beranda; teks `#625c52` di atas `#faf5eb` harus dicek axe. Fokus terlihat (ring token `#b52f24` atau outline biru yang ada), target sentuh >= 44 px.
- Skip link "Langsung ke konten" tetap tab pertama dan memfokuskan `main` (`id="main-content"`, `tabIndex=-1`).
- Sheet menu mobile: fokus terperangkap, Esc menutup, fokus kembali ke pemicu, judul dialog (sr-only) tersedia, latar inert (perilaku Radix).
- Gambar dengan `alt` bermakna (alt wajib untuk gambar CMS sudah ada); dekoratif `alt=""`. Ikon lucide `aria-hidden`.
- `prefers-reduced-motion` dihormati (hindari animasi besar).

SEO (tanpa perubahan kebijakan):
- `metadata` per halaman tetap dari `publishedMetadata`/`getPageMetadata`; judul unik per halaman; `robots: noindex, nofollow` tetap; tanpa canonical, tanpa hreflang, tanpa `application/ld+json`; `lang="id"`.
- Konten teks halaman tetap dirender di server (tidak ada fetch Axios di client untuk teks yang bisa diindeks).
- Tautan internal tanpa prefix `/id`/`/en`.

Performa:
- Tidak ada JS client baru kecuali menu mobile (Sheet) dan komponen client yang sudah ada.
- Gambar via `next/image` dengan `sizes` benar; hanya satu gambar LCP yang di-preload per halaman; rasio tetap (4:3 kartu/hero, mengikuti dimensi aset untuk media) agar CLS = 0.
- Tanpa font web baru secara default (Arial tetap), tanpa CSS/JS pihak ketiga, tanpa permintaan eksternal (suite memblokir origin eksternal).
- Target QA: Lighthouse mobile >= 90 untuk performance/accessibility/best-practices/SEO pada `/`, `/menu`, `/guides/takoyaki` (build produksi lokal); LCP <= 2,5 detik, CLS <= 0,1 sebagai target, dilaporkan apa adanya (bukan janji). Pengukuran CWV nyata tetap item terbuka terpisah di ROADMAP.

## 9. Dampak dependency dan `package.json`

- Default: TIDAK ada perubahan `package.json`/lockfile. Semua kebutuhan terpenuhi oleh `radix-ui` 1.8.1 (umbrella), `class-variance-authority`, `lucide-react`, `tailwind-merge`, `tw-animate-css`, dan Tailwind 4.3.3 yang sudah terpasang. Komponen baru (bila ada) disalin manual ke `src/components/ui/*.jsx` mengikuti pola repo (JSX, `import { X } from "radix-ui"`, lisensi MIT/LICENSE sudah ada di folder).
- Tidak menjalankan `npx shadcn add` yang menimpa file; tidak ada konversi TypeScript.
- Bila `next/font` dipilih untuk font baru (pertanyaan terbuka Q1), itu bukan dependency baru tetapi keputusan brand + perubahan build (font self-host saat build); perlu persetujuan eksplisit.
- Catatan: `components.json` menunjuk `src/styles/admin.css`; bila CLI shadcn dipakai kelak, perlu diarahkan ulang. Tidak diubah di spec ini (hanya dokumentasi di tugas FE).

## 10. Acceptance criteria (terukur)

Fondasi dan shell
- AC-1: Satu scope token publik (`.site-root` atau setara) berisi nilai token yang sama persis dengan `.home-theme` sekarang; tidak ada nilai warna baru di CSS publik selain turunan token tersebut; `grep` `home-theme` di `src` tidak menyisakan selektor ganda (kecuali alias sementara yang disebut di PR).
- AC-2: Setiap halaman publik (12 rute fixture di `tests/e2e/fixtures.js` dan 9 identitas terbit) merender `<html lang="id">`, tepat satu `<h1>`, `main#main-content` yang menerima fokus dari skip link, dan `meta robots` "noindex, nofollow".
- AC-3: Pada viewport 360 px (dan 320 px): header menampilkan tombol menu (Sheet) dan tidak ada overflow horizontal; Sheet berisi 4 tautan yang sama dengan desktop; Esc menutup dan fokus kembali ke tombol; pada >= 768 px nav inline menampilkan 4 tautan dan tombol menu tersembunyi.
- AC-4: `nav[aria-label="Navigasi utama"]` berisi tepat 4 tautan (Menu, Tentang, Promo & event, Pesan -> `/#ordering`); `nav[aria-label="Halaman lainnya"]` berisi Panduan makanan, Promo, Lokasi; `nav[aria-label="Jejak halaman"]` ada di semua halaman non-home dengan item terakhir `aria-current="page"`.

Halaman
- AC-5 (home): hero memuat h1, 2 CTA (href `/menu` dan `/about`), gambar 4:3 dengan `alt`; section menu menampilkan s.d. 4 kartu produk (nama, deskripsi, harga, gambar 4:3) atau teks "Menu belum diterbitkan." saat kosong; tidak ada tautan order pihak ketiga.
- AC-6 (about/promos/location): field CMS tampil sesuai template (storyHeading/Body, serviceHeading/Body; city/service/hours/coverage hanya bila terisi, dalam `dl`); field kosong tidak merender heading kosong; keadaan tanpa data memakai teks yang sudah ada.
- AC-7 (menu/detail): kartu produk tampil sebagai `Card` dengan satu tautan ke `/menu/<slug>`; harga format `Rp` via `formatPrice`; gambar rasio 4:3 tanpa CLS (CLS halaman <= 0,1 pada audit); detail menampilkan h1, harga tunggal, gambar dengan alt, tombol kembali; tidak ada checkbox/combobox/status modifier (assert yang sudah ada tetap lulus).
- AC-8 (blog): `/guides` menampilkan 3 kartu artikel (judul tertaut ke `/guides/<slug>`, ringkasan bila ada); `/guides/<slug>` menampilkan breadcrumb, h1, ringkasan, rich text, media, dan dua tautan navigasi bawah; slug tak dikenal tetap 404 (mode terbit: `/guides/takoyaki` 404 bila belum terbit).
- AC-9: Rich text yang sama menghasilkan teks yang sama (tidak ada konten hilang): tes `<script>literal only</script>` tetap tampil sebagai teks literal dan `main script` count = 0; YouTube tetap tidak memuat iframe sebelum tombol "Muat video YouTube" ditekan.

Kualitas
- AC-10: axe (wcag2a, wcag2aa, wcag21a/aa, wcag22aa) = 0 pelanggaran dan 0 `incomplete` pada 12 rute fixture dan 9 rute terbit (viewport desktop 1280 dan mobile 375).
- AC-11: Tidak ada `application/ld+json`, tidak ada `link[hreflang]`/`rel=alternate`, tidak ada tautan `href` berawalan `/id` atau `/en`; `/en/*` 404 dan `/id/*` 308 tanpa rantai (suite navigation tetap lulus).
- AC-12: Tidak ada permintaan jaringan ke origin selain `127.0.0.1:3030` dan tidak ada runtime error di browser (guard `fixtures.js` tetap lulus).
- AC-13: `git diff` tidak menyentuh `src/app/admin`, `src/app/api`, `src/features/cms` (selain tidak ada), `src/server`, `drizzle/`, `package.json`, `package-lock.json`.
- AC-14: Gate rilis lulus dan dilaporkan dengan hasil aktual: `npm run lint`, `npm run build`, `npx playwright test` (tests/e2e), `npm run test:published-e2e`, `npm run test:cms-pages-e2e`, `node --test tests/unit/page-content.test.mjs tests/unit/home-draft.test.mjs`, `npm run test:public-db`, `npm run security:check` (butuh DB uji; yang tidak bisa dijalankan dilaporkan sebagai tidak dijalankan).
- AC-15: Audit Lighthouse mobile lokal (build produksi) pada `/`, `/menu`, `/guides/takoyaki` dicatat (angka aktual); target >= 90 pada empat kategori; bila < 90 dicatat sebagai risiko residual, bukan dianggap gagal otomatis.

## 11. Tugas per peran

Backend (`backend`): kemungkinan tidak ada pekerjaan. Hanya konfirmasi bahwa `publicPage`, `publicCatalog` (`src/server/public/data.mjs`, `view-models.mjs`) sudah mengembalikan data yang dibutuhkan (guide: `fields.summary`, `media[]`; produk: title, description, price, media). Jika ternyata butuh field/query baru (mis. cover guide), STOP dan ajukan spec terpisah. Tidak ada migrasi.

Frontend (`frontend`) - file terdampak:
1. Fondasi: `src/styles/globals.css`, `src/styles/home.css` (lebur ke scope situs), kemungkinan file baru `src/styles/site.css`; `src/app/(site)/layout.jsx` (kelas scope pada `<body>`); `src/app/global-not-found.jsx` dan `src/app/(site)/not-found.jsx`, `error.jsx` (selaraskan).
2. Shell: `SiteHeader.jsx` (+ komponen client kecil untuk Sheet), `SiteFooter.jsx`, banner pratinjau di layout, `OrderingNotice.jsx` (tanpa tautan, `Card`/`Button` disabled-state teks sama).
3. Halaman terbit: pecah `PublishedContent.jsx` menjadi komponen per template di `src/features/public-site/components/` (mis. `PageHeader`, `AboutSections`, `LocationInfo`, `ProductCard`, `GuideCard`, `GuideArticle`) dengan `PublishedPage`/`PublishedProduct`/`publishedMetadata` tetap sebagai API ekspor yang sama.
4. Mode fixture: `HomeContent` (juga dipakai `PagePreview`), `MenuCard.jsx` (ganti ke `Card`), `PageIntro.jsx` (ganti ke Breadcrumb), halaman `src/app/(site)/{page,about,guides,guides/[slug],menu,menu/[slug],promos,location}`, `fixtures/*`, `content.js`, `page-content.js` (salinan hanya dipertahankan/dirapikan, tanpa klaim baru).
5. `PublicRichText.jsx`: kelas tipografi bersama (prosa), logika render tidak berubah; `PublishedMedia.jsx`/`ProductCardImage.jsx`: ganti kelas, perilaku tidak berubah.
6. Hapus CSS legacy yang tidak lagi dipakai HANYA setelah `grep` membuktikan tidak dipakai oleh admin/auth/not-found; jangan hapus kelas `.auth-*`, `.cms-*`, `.published-*` yang masih dipakai.
7. Larangan: tidak menambah dependency, tidak mengubah copy bisnis, tidak mengarang gambar/alamat/harga/promo, tidak menampilkan link order.

QA (`qa`) - file terdampak (selector yang akan patah dan harus diperbarui bersama FE, bukan diperlemah):
- `tests/e2e/navigation.spec.js`: `.hero-actions`, `.menu-card`, `.notice-box`, `.info-list`, `.ordering-section .platform-card`, `.empty-state`, jumlah 4 tautan navbar.
- `tests/e2e/accessibility.spec.js`: `.main-nav` dan asumsi 5 kali Tab hingga tautan Promo (urutan fokus berubah karena tombol menu/logo).
- `tests/e2e/public-routes.spec.js`: `.preview-banner`, regex judul/deskripsi fixture.
- `tests/published-e2e/public.spec.mjs`: `.home-art-image`, `.home-art figcaption`, `.home-theme [data-slot="button"]`, `.preview-banner`, teks "Menu belum diterbitkan.", konsistensi gambar 4:3 dan 1600x1200.
- `tests/cms-pages-e2e/pages.spec.mjs` dan `scripts/run-cms-pages-qa.mjs`: pratinjau Beranda di editor.
- `tests/unit/page-content.test.mjs` (templates/validasi) dan `tests/unit/home-draft.test.mjs`: harus tetap lulus tanpa perubahan; kegagalan berarti scope bocor.
- Tambahan: uji viewport 320/375/768/1280, uji Sheet (fokus, Esc), snapshot visual opsional, audit Lighthouse (AC-15), cek tiga mode: fixture, terbit-kosong (`QA_PUBLIC_EMPTY=1`), terbit-berisi.
- Pertahankan sebisa mungkin selector berbasis role/label; gunakan `data-testid` hanya bila perlu dan sebutkan di PR.

## 12. Urutan eksekusi

1. Persetujuan spec ini dan jawaban pertanyaan terbuka (terutama Q1, Q2, Q3).
2. FE: fondasi token + shell (header/footer/breadcrumb/Sheet) -> uji e2e shell.
3. FE: halaman marketing (home, about, promos, location).
4. FE: menu dan detail produk.
5. FE: blog (indeks, artikel).
6. QA: pembaruan selector, suite penuh, axe, Lighthouse; perbaikan (maks 2 putaran).
7. Bersihkan CSS legacy; laporan akhir. Pelaksanaan bisa dipecah menjadi PR bertahap (rekomendasi: 3 PR: shell+fondasi, marketing+katalog, blog) agar mudah di-rollback.
Tidak ada commit/push/deploy tanpa izin terpisah.

## 13. Risiko dan mitigasi

- R1 Regresi test berbasis class CSS (banyak): mitigasi - perbarui selector di PR yang sama, jangan melonggarkan assertion keamanan/aksesibilitas.
- R2 Dua mode render (fixture/terbit) menggandakan pekerjaan dan berisiko berbeda tampilan: mitigasi - gunakan komponen yang sama untuk kedua mode; fixture hanya menyuplai data. Pertanyaan Q6 menanyakan apakah mode fixture boleh disederhanakan.
- R3 `button.jsx`/`card.jsx` dipakai juga oleh admin: mitigasi - jangan ubah varian bersama; tambahkan varian baru atau kelas di sisi publik; QA regresi cepat `test:cms-pages-e2e`.
- R4 Leakage CSS: `globals.css` juga diimpor oleh admin dan `global-not-found`; legacy global (`h1,h2,h3,p{margin:0}`, `a{color:inherit}`) memengaruhi shadcn. Mitigasi - scope token dan reset di `.site-root`, jangan edit reset global yang dipakai admin tanpa cek.
- R5 Performa: kartu/gambar berlebihan atau hero berat menurunkan LCP/CLS; mitigasi - rasio tetap, satu preload, Lighthouse di AC-15. Gambar hero saat ini JPEG 1600x1200 `unoptimized`; mengoptimalkannya adalah keputusan terpisah (jangan diubah diam-diam; bisa diusulkan di PR).
- R6 Konten tampak "kosong" karena data produksi belum ada (guide, promo, lokasi tanpa data): mitigasi - desain keadaan kosong yang jujur; jangan mengisi placeholder yang terlihat nyata.
- R7 Kredibilitas bisnis: redesain tergoda menambah bukti sosial, angka, atau klaim; mitigasi - larangan eksplisit di AC dan review PM.
- R8 Aksesibilitas menu mobile (Sheet) dan urutan Tab mengubah ekspektasi test keyboard; mitigasi - AC-3 dan pembaruan test.

Rollback: revert PR/commit UI (tanpa perubahan skema/data sehingga tidak ada rollback DB); build ulang; tidak ada konten CMS yang berubah.

## 14. Asumsi

- A1: "Marketing" = home, about, promos, location; "blog" = guides dan guides/<slug>; menu dan detail produk diikutkan sebagai katalog karena cakupan "semua selain admin".
- A2: "Struktur baru" berarti layout dan komponen baru, bukan perubahan konten, skema, atau field CMS.
- A3: Token warna, radius, dan font tetap seperti kondisi sekarang; tidak ada brand guideline baru di repo (`BRAND_ASSETS.md` tidak memuat palet/font).
- A4: Situs tetap `noindex` sampai spec Phase 3 canonical/sitemap berjalan.
- A5: Tiga guide tetap sebagai tiga identitas halaman tetap (takoyaki, okonomiyaki, burger).

## 15. Pertanyaan terbuka dan rekomendasi

- Q1 Referensi warna/brand/font: apakah ada panduan brand atau referensi visual selain logo/foto yang ada? Rekomendasi: PAKAI token yang ada (cream `#faf5eb`, merah `#b52f24`, tinta `#25251f`, Arial); tidak ada font/warna baru dan tidak ada klaim brand baru. Bila user menginginkan font berbeda, minta nama font + lisensi, lalu diputuskan terpisah (lewat `next/font`, tanpa dependency baru).
- Q2 Konten placeholder vs nyata: apakah redesain diuji dengan konten nyata di staging, atau cukup fixture/QA? Rekomendasi: bangun dengan keadaan kosong yang jujur; jangan menulis konten baru; konten nyata (teks, foto asli, guide) diisi Owner lewat CMS setelah rilis. Placeholder fixture tetap berlabel contoh dan hanya di mode pratinjau.
- Q3 Blog: hanya penyegaran visual, atau fitur baru (paginasi, kategori/tag, tanggal terbit, penulis, waktu baca, artikel terkait, gambar sampul)? Rekomendasi: hanya penyegaran (3 artikel tetap, tanpa data tanggal/penulis). Fitur baru butuh field/skema dan konten sehingga dijadikan spec terpisah. Cover kartu guide memakai media pertama yang sudah ada bila ada (tanpa field baru).
- Q4 Urutan terhadap pekerjaan lain: (a) daftar host resmi link order + tampilan publik link order, (b) pengukuran CWV nyata, (c) canonical/sitemap Phase 3. Rekomendasi: kerjakan redesain lebih dulu karena tidak bergantung ke (a); tampilan link order dirancang sesudahnya memakai komponen kartu/tombol baru. Ambil baseline Lighthouse SEBELUM redesain (disimpan di PR) agar perbandingan adil, dan ukur ulang sesudahnya; (c) tidak terdampak.
- Q5 FAQ/Accordion: halaman manakah yang butuh FAQ? Saat ini tidak ada field atau konten FAQ. Rekomendasi: tidak dipakai di spec ini; jika dibutuhkan, spec terpisah dengan field baru (dan mungkin migrasi) serta konten terverifikasi.
- Q6 Mode fixture/pratinjau (`usesPublishedContent() === false`): tetap dipertahankan penuh? Rekomendasi: pertahankan tampilan yang sama lewat komponen bersama (suite `tests/e2e` bergantung padanya); penyederhanaan/penghapusan mode fixture diputuskan terpisah.
- Q7 Hero gambar beranda: tetap memakai `/images/02a - Takoyaki Shio Negi.jpeg` apa adanya (`unoptimized`), atau boleh dioptimalkan lewat `next/image`? Rekomendasi: tetap dulu; optimasi gambar sebagai perbaikan terpisah setelah baseline CWV.
- Q8 Pemecahan PR: satu PR besar atau tiga PR bertahap? Rekomendasi: tiga PR bertahap (lihat bagian 12).
- Q9 Nama branch implementasi: usulan `feat/public-pages-shadcn` dari main terbaru. Perlu persetujuan sebelum dibuat.
