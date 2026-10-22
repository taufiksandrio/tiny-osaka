import "server-only";
import { z } from "zod";
import { CmsRequestError, cmsFail } from "../cms/request-policy.mjs";
import { MediaError } from "../media/validation.mjs";
import { PageContentError } from "../pages/validation.mjs";
import { CatalogDraftError } from "../catalog/drafts.mjs";
import { getPageDefinition } from "../pages/templates.mjs";
import { hostOf } from "./import-url.mjs";

// The MCP tools (docs/specs/mcp-owner.md section 5, mcp-owner-v2.md). Each one calls the same CMS service as the HTTP routes,
// so validation, locking, version conflicts and the "saved = live" behavior (ADR-036/037) are not duplicated here.
// No tool syncs a merchant or touches accounts. File bytes never travel through a tool: media_upload_request only hands out
// single-use upload URLs (Q-5) and the upload itself goes through createCmsMedia.upload. Order links are intentionally not exposed.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID);
const slug = z.string().min(1).max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const version = z.string().regex(/^[0-9a-f]{64}$/);

const productFields = {
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  price: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  imageAssetId: uuid.nullable().optional(),
  imageAlt: z.string().max(500).nullable().optional(),
};
const strict = shape => z.object(shape).strict();

export const schemas = Object.freeze({
  menu_list: strict({}),
  menu_create: strict(productFields),
  // Partial update: only slug is required; absent keys keep their stored value (at least one field is enforced server-side).
  menu_update: strict({ slug, expectedVersion: version.optional(), ...productFields, name: productFields.name.optional(), price: productFields.price.optional() }),
  menu_delete: strict({ slug, confirmName: z.string().max(200) }),
  page_list: strict({}),
  page_get: strict({ pageKey: z.string().min(1).max(64) }),
  // Expected revision/version are never user input here: they are read under the page lock.
  page_update: strict({ pageKey: z.string().min(1).max(64), fields: z.record(z.string(), z.unknown()).optional(), mediaOperations: z.array(z.record(z.string(), z.unknown())).max(24).optional() }),
  // Deprecated alias of page_update (v1 schema kept for existing clients).
  page_save: strict({ pageKey: z.string().min(1).max(64), expectedRevisionId: uuid.nullable(), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    fields: z.record(z.string(), z.unknown()), mediaOperations: z.array(z.record(z.string(), z.unknown())).max(24).default([]) }),
  media_list: strict({ offset: z.number().int().min(0).max(100000).optional(), thumbnails: z.boolean().optional() }),
  media_get: strict({ id: uuid }),
  media_register_youtube: strict({ videoId: z.string().min(1).max(32), posterId: uuid }),
  // Q-5: target is informational only ("menu:<slug>" or "page:<pageKey>"); nothing is attached automatically.
  media_upload_request: strict({ target: z.string().max(200).regex(/^(menu:[a-z0-9]+(-[a-z0-9]+)*|page:[A-Za-z0-9_-]{1,64})$/).optional(),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(), byteSize: z.number().int().min(1).max(10000000).optional() }),
  media_upload_status: strict({ uploadId: uuid }),
  // Q-6: the URL is validated by net-guard; the schema only bounds its length.
  media_import_url: strict({ url: z.string().min(1).max(2048) }),
});

// Same codes as the CMS API: a rejected field maps to the error the HTTP route would have returned.
const FIELD_CODES = Object.freeze({ price: "INVALID_PRICE", name: "INVALID_NAME", description: "INVALID_DESCRIPTION",
  imageAssetId: "INVALID_IMAGE", imageAlt: "INVALID_IMAGE_ALT", confirmName: "CONFIRM_NAME_MISMATCH" });
export const parseToolInput = (name, args) => {
  const schema = schemas[name];
  const result = schema.safeParse(args ?? {});
  if (result.success) return result.data;
  const first = result.error.issues.find(issue => issue.code !== "unrecognized_keys" && FIELD_CODES[issue.path[0]]);
  const unknown = result.error.issues.some(issue => issue.code === "unrecognized_keys");
  if (first && !unknown) cmsFail(FIELD_CODES[first.path[0]], 400, { field: first.path[0] });
  cmsFail("INVALID_INPUT", 400, unknown ? undefined : { field: String(result.error.issues[0]?.path[0] ?? "") });
};

const CONFLICTS = ["REVISION_CONFLICT", "HASH_CONFLICT", "LIVE_REVISION", "APPROVAL_REQUIRED", "SLUG_CONFLICT", "PRODUCT_CONFLICT"];
// Never returns messages, stacks or database details: only a stable code, its HTTP-equivalent status and a small detail object.
export const describeFailure = error => {
  if (error instanceof CmsRequestError) return { code: error.code, status: error.status, ...(error.detail ? { detail: error.detail } : {}) };
  if (error instanceof MediaError) return { code: error.code, status: error.code === "PERSISTENCE_FAILED" ? 503 : 400 };
  if (error instanceof PageContentError || error instanceof CatalogDraftError) {
    const code = error.code;
    return { code, status: code === "FORBIDDEN" ? 403 : code === "AUTH_REQUIRED" ? 401 : CONFLICTS.includes(code) ? 409 : code === "PERSISTENCE_FAILED" ? 503 : 400 };
  }
  return { code: "CMS_UNAVAILABLE", status: 503 };
};

// A tool may attach MCP image content (thumbnails) to its JSON result. The images ride on a symbol, so they never enter the JSON text.
const IMAGES = Symbol("mcp.images");
export const withImages = (value, images) => images.length ? Object.defineProperty({ ...value }, IMAGES, { value: Object.freeze(images.map(({ mimeType, data }) => ({ mimeType, data }))) }) : value;
export const imagesOf = output => (output && typeof output === "object" && output[IMAGES]) || [];

const pageView = page => ({ pageKey: page.pageKey, id: page.id, version: page.version, fields: page.fields, mediaRefs: page.mediaRefs,
  mediaAssets: page.mediaAssets, updatedAt: page.updatedAt });
const knownPage = key => { if (!getPageDefinition(key)) cmsFail("NOT_FOUND", 404); return key; };

// scope: the OAuth scope the token must hold. refresh: public pages are re-rendered after a successful write.
const tool = (title, description, scope, run, { write = false, destructive = false, refresh = false, target = () => null } = {}) =>
  Object.freeze({ title, description, scope, write, refresh, target, run, annotations: Object.freeze({ readOnlyHint: !write, destructiveHint: destructive, idempotentHint: !write, openWorldHint: false }) });

export const tools = Object.freeze({
  menu_list: tool("Daftar menu", "Daftar kartu menu yang tayang beserta role pengguna. Wajib: tidak ada input. Otomatis/Opsional: hasil memuat slug dan version tiap menu (dipakai menu_update/menu_delete). Contoh: {} -> daftar menu seperti Roti Bakar harga 8000.", "mcp:read", (cms, h) => cms.catalog.list(h)),
  menu_create: tool("Tambah menu", "Membuat kartu menu baru; langsung tayang. Wajib: name (teks 1-120 karakter) dan price (rupiah, bilangan bulat >= 0). Otomatis/Opsional: slug dibuat otomatis dari name (tabrakan menjadi -2, -3) dan dikembalikan; description opsional; imageAssetId opsional (id aset dari media_list), dan bila imageAlt tidak dikirim maka alt = name; imageAlt tanpa imageAssetId ditolak IMAGE_REQUIRED. Jangan mengarang data. Contoh: {\"name\":\"Roti Bakar\",\"price\":8000}.", "mcp:write",
    async (cms, h, input) => cms.catalog.create(h, input.imageAssetId && (input.imageAlt === undefined || input.imageAlt === null) ? { ...input, imageAlt: input.name } : input),
    { write: true, refresh: true, target: (_input, result) => result?.product?.slug }),
  menu_update: tool("Ubah menu", "Mengubah kartu menu; langsung tayang. Wajib: slug dan minimal satu field yang diubah (name, description, price, imageAssetId, imageAlt); slug saja ditolak INVALID_INPUT. Otomatis/Opsional: field yang tidak dikirim dipertahankan; description \"\" mengosongkan deskripsi; imageAssetId tanpa imageAlt memakai name hasil gabungan sebagai alt; imageAssetId null menghapus gambar; expectedVersion opsional (diambil otomatis dari kartu terkini) dan bila dikirim lalu berbeda ditolak PRODUCT_CONFLICT; slug tidak ada -> NOT_FOUND. Contoh: {\"slug\":\"roti-bakar\",\"price\":9000}.", "mcp:write",
    async (cms, h, { slug: key, ...input }) => cms.catalog.merge(h, key, input), { write: true, refresh: true, target: input => input.slug }),
  menu_delete: tool("Hapus menu", "Menghapus kartu menu SECARA PERMANEN dan langsung. Wajib: slug dan confirmName (harus sama persis dengan nama menu; berbeda ditolak CONFIRM_NAME_MISMATCH). Otomatis/Opsional: tidak ada field opsional; tidak ada pemulihan. Contoh: {\"slug\":\"roti-bakar\",\"confirmName\":\"Roti Bakar\"}.", "mcp:write",
    async (cms, h, input) => { const done = await cms.catalog.remove(h, input.slug, { confirmName: input.confirmName }); return { success: true, slug: done.slug }; },
    { write: true, destructive: true, refresh: true, target: input => input.slug }),
  page_list: tool("Daftar halaman", "Daftar halaman tetap beserta waktu pembaruan dan revisi yang tayang. Wajib: tidak ada input. Otomatis/Opsional: hasil memuat pageKey tiap halaman (dipakai page_get/page_update). Contoh: {} -> daftar pageKey seperti about.", "mcp:read",
    async (cms, h) => (await cms.pages.list(h)).map(page => ({ pageKey: page.key, publishedRevisionId: page.publishedRevisionId, updatedAt: page.updatedAt }))),
  page_get: tool("Baca halaman", "Membaca isi halaman terkini. Wajib: pageKey (kunci halaman dari page_list). Otomatis/Opsional: halaman yang belum pernah diisi dikembalikan dengan version 0 dan fields kosong. Contoh: {\"pageKey\":\"about\"}.", "mcp:read",
    async (cms, h, input) => pageView(await cms.pages.current(h, knownPage(input.pageKey))), { target: input => input.pageKey }),
  page_update: tool("Ubah halaman", "Mengubah isi halaman sesuai templat tetap; langsung tayang. Wajib: pageKey. Otomatis/Opsional: fields parsial (hanya kunci yang dikirim diganti, kunci lain dipertahankan; kunci di luar templat ditolak INVALID_CONTENT); mediaOperations opsional (daftar {action:\"mediaSave\"|\"mediaRemove\", data}) dan pada mediaSave altId kosong diisi judul halaman (title), bila judul kosong ditolak INVALID_INPUT; revisi dan version terkini diambil otomatis (tidak perlu page_get); tanpa perubahan tidak dibuat revisi baru. Contoh: {\"pageKey\":\"about\",\"fields\":{\"title\":\"Tentang Roti Bakar\"}}.", "mcp:write",
    async (cms, h, input) => pageView(await cms.pages.merge(h, knownPage(input.pageKey), input.fields ?? {}, input.mediaOperations ?? [])), { write: true, refresh: true, target: input => input.pageKey }),
  page_save: tool("Simpan halaman (usang)", "DEPRECATED, gunakan page_update. Wajib: pageKey, expectedRevisionId, expectedVersion, fields. Otomatis/Opsional: mediaOperations opsional; bekerja sebagai alias page_update: sekarang MERGE parsial, fields digabung ke isi terkini dan kunci yang tidak dikirim tetap ada (v1 mengganti seluruh isi) dan expectedRevisionId/expectedVersion yang berbeda dari kondisi terkini ditolak REVISION_CONFLICT. Contoh: {\"pageKey\":\"about\",\"expectedRevisionId\":null,\"expectedVersion\":0,\"fields\":{\"title\":\"Tentang Roti Bakar\"}}.", "mcp:write",
    async (cms, h, { pageKey, fields, mediaOperations, expectedRevisionId, expectedVersion }) =>
      pageView(await cms.pages.merge(h, knownPage(pageKey), fields, mediaOperations, { expectedRevisionId, expectedVersion })), { write: true, refresh: true, target: input => input.pageKey }),
  media_list: tool("Daftar media", "Daftar metadata aset media (48 per halaman, terbaru lebih dulu, tiap aset memuat createdAt ISO). Tidak mengembalikan isi berkas asli atau lokasi penyimpanan. Wajib: tidak ada. Otomatis/Opsional: offset opsional (bilangan bulat >= 0, default 0); thumbnails opsional (true/false, default false): bila true, thumbnail kecil (maks 512 px, WebP) disertakan sebagai konten gambar HANYA untuk 12 aset gambar teratas pada halaman itu, urutannya sama dengan thumbnailIds di hasil JSON; video/YouTube tidak punya thumbnail; thumbnail gagal dibuat dihilangkan tanpa menggagalkan daftar. Contoh: {\"offset\":0,\"thumbnails\":true}.", "mcp:read",
    async (cms, h, { thumbnails, ...input }, context) => {
      const listed = await cms.media.listDated(h, input);
      if (thumbnails !== true) return listed;
      const images = await context.thumbnails.forList(cms, h, listed.rows);
      return withImages({ ...listed, thumbnailIds: images.map(item => item.id) }, images);
    }),
  media_get: tool("Detail media", "Metadata satu aset media (termasuk createdAt ISO) dan, untuk aset gambar, thumbnail kecil (maks 512 px, WebP) sebagai konten gambar di samping JSON; dipakai untuk memeriksa visual bahwa foto cocok. Tidak mengembalikan berkas asli atau lokasi penyimpanan. Wajib: id (UUID aset dari media_list). Otomatis/Opsional: thumbnail dibuat otomatis tiap panggilan dan tidak disimpan; video/YouTube tanpa thumbnail; bila thumbnail gagal dibuat, metadata tetap dikembalikan tanpa gambar. Contoh: {\"id\":\"<uuid-aset>\"}.", "mcp:read",
    async (cms, h, input, context) => {
      const meta = await cms.media.metaDated(h, input.id);
      const thumb = await context.thumbnails.forAsset(cms, h, meta);
      return thumb ? withImages(meta, [thumb]) : meta;
    }, { target: input => input.id }),
  media_register_youtube: tool("Daftarkan video YouTube", "Mendaftarkan video YouTube sebagai aset media. Wajib: videoId (id video YouTube) dan posterId (UUID aset gambar yang sudah ada sebagai poster). Otomatis/Opsional: tidak ada field opsional; poster bukan gambar ditolak INVALID_POSTER. Contoh: {\"videoId\":\"Abc_123-xyz\",\"posterId\":\"<uuid-poster>\"}.", "mcp:write",
    (cms, h, input) => cms.media.youtube(h, input), { write: true, refresh: true, target: (_input, result) => result?.id }),
  // The result carries the single-use URLs, so target() reads only the (informational) input and never the result.
  media_upload_request: tool("Minta unggah foto", "Membuat permintaan unggah satu foto (JPG, PNG, atau WebP, maks 10 MB, maks 4096 px) dan mengembalikan uploadId, agentUploadUrl, dan userUploadUrl. Wajib: tidak ada field wajib. Otomatis/Opsional: target opsional berbentuk \"menu:<slug>\" atau \"page:<pageKey>\" (hanya catatan, foto tidak dipasang otomatis); mime opsional (image/jpeg, image/png, image/webp) dan byteSize opsional (1..10000000), bila dikirim unggahan yang berbeda ditolak MIME_MISMATCH/SIZE_MISMATCH. Cara pakai: bila Anda punya akses berkas dan jaringan, kirim POST biner ke agentUploadUrl (header Content-Type sesuai jenis gambar, tanpa cookie dan tanpa Authorization; berlaku 5 menit, sekali pakai) lalu baca assetId; bila tidak, berikan userUploadUrl kepada Owner (berlaku 15 menit, perlu login Owner yang sama), tanyakan kapan sudah selesai, lalu panggil media_upload_status. Setelah foto jadi, panggil media_get dan periksa thumbnail/metadata bahwa foto cocok dengan menu atau halaman tujuan sebelum memasangnya lewat menu_update atau page_update. Jangan menulis URL unggah ke konten situs atau log. Contoh: {\"target\":\"menu:roti-bakar\",\"mime\":\"image/jpeg\"}.", "mcp:write",
    (_cms, _h, input, context) => context.uploads.request(context.actor, input), { write: true, target: input => input.target }),
  media_upload_status: tool("Status unggah foto", "Memeriksa hasil permintaan unggah foto. Wajib: uploadId (dari media_upload_request). Otomatis/Opsional: hasil status adalah pending, done, expired, atau rejected; assetId hanya ada bila done (pakai untuk media_get lalu menu_update/page_update); rejected memuat failureCode; hanya pemilik permintaan yang dapat melihat, selain itu NOT_FOUND. Contoh: {\"uploadId\":\"<uuid-unggahan>\"}.", "mcp:read",
    (_cms, _h, input, context) => context.uploads.status(context.actor, input), { target: () => null }),
  // Audit target is the host only (hostOf), never the URL. No cache refresh: an import alone changes no public content.
  media_import_url: tool("Impor foto dari URL", "Mengunduh satu foto dari URL HTTPS publik ke pustaka media dan mengembalikan metadata aset (id dipakai untuk menu_update/page_update). Wajib: url (https, port 443, nama domain; harus tautan unduhan langsung ke berkas gambar; halaman berbagi Google Drive/Dropbox ditolak SHARE_LINK_UNSUPPORTED dan tidak diubah otomatis). Otomatis/Opsional: tidak ada field opsional; hanya JPG, PNG, atau WebP maks 10 MB dan 4096 px; maks 3 redirect, batas waktu 15 detik; IP privat/internal, port lain, userinfo, dan halaman HTML ditolak; satu impor aktif per Owner; fitur dapat dimatikan server (IMPORT_DISABLED). Setelah berhasil, periksa hasil lewat media_get sebelum memasangnya. Jangan mengimpor foto tanpa hak pakai. Contoh: {\"url\":\"https://example.com/foto/roti-bakar.jpg\"}.", "mcp:write",
    (cms, h, input, context) => context.imports.run(cms, h, input, context.actor), { write: true, target: input => hostOf(input?.url) }),
});
export const toolNames = Object.freeze(Object.keys(tools));

export const listTools = () => toolNames.map(name => {
  const { $schema: _schema, ...inputSchema } = z.toJSONSchema(schemas[name], { io: "input" });
  return { name, title: tools[name].title, description: tools[name].description, inputSchema, annotations: tools[name].annotations };
});
