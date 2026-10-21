import "server-only";
import { z } from "zod";
import { CmsRequestError, cmsFail } from "../cms/request-policy.mjs";
import { MediaError } from "../media/validation.mjs";
import { PageContentError } from "../pages/validation.mjs";
import { CatalogDraftError } from "../catalog/drafts.mjs";
import { getPageDefinition } from "../pages/templates.mjs";

// The 10 MCP tools (docs/specs/mcp-owner.md section 5). Each one calls the same CMS service as the HTTP routes,
// so validation, locking, version conflicts and the "saved = live" behavior (ADR-036/037) are not duplicated here.
// No tool syncs a merchant, uploads a file, or touches accounts. Order links are intentionally not exposed.
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
  menu_update: strict({ slug, expectedVersion: version, ...productFields }),
  menu_delete: strict({ slug, confirmName: z.string().max(200) }),
  page_list: strict({}),
  page_get: strict({ pageKey: z.string().min(1).max(64) }),
  page_save: strict({ pageKey: z.string().min(1).max(64), expectedRevisionId: uuid.nullable(), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    fields: z.record(z.string(), z.unknown()), mediaOperations: z.array(z.record(z.string(), z.unknown())).max(24).default([]) }),
  media_list: strict({ offset: z.number().int().min(0).max(100000).optional() }),
  media_get: strict({ id: uuid }),
  media_register_youtube: strict({ videoId: z.string().min(1).max(32), posterId: uuid }),
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

const pageView = page => ({ pageKey: page.pageKey, id: page.id, version: page.version, fields: page.fields, mediaRefs: page.mediaRefs,
  mediaAssets: page.mediaAssets, updatedAt: page.updatedAt });
const knownPage = key => { if (!getPageDefinition(key)) cmsFail("NOT_FOUND", 404); return key; };

// scope: the OAuth scope the token must hold. refresh: public pages are re-rendered after a successful write.
const tool = (title, description, scope, run, { write = false, destructive = false, refresh = false, target = () => null } = {}) =>
  Object.freeze({ title, description, scope, write, refresh, target, run, annotations: Object.freeze({ readOnlyHint: !write, destructiveHint: destructive, idempotentHint: !write, openWorldHint: false }) });

export const tools = Object.freeze({
  menu_list: tool("Daftar menu", "Daftar kartu menu yang tayang beserta role pengguna.", "mcp:read", (cms, h) => cms.catalog.list(h)),
  menu_create: tool("Tambah menu", "Membuat kartu menu baru. Langsung tayang di situs. Nama dan harga (rupiah, bilangan bulat) wajib; jangan mengarang data.", "mcp:write",
    async (cms, h, input) => cms.catalog.create(h, input), { write: true, refresh: true, target: (_input, result) => result?.product?.slug }),
  menu_update: tool("Ubah menu", "Mengubah kartu menu berdasarkan slug dan expectedVersion terbaru dari menu_list. Langsung tayang.", "mcp:write",
    async (cms, h, { slug: key, ...input }) => cms.catalog.update(h, key, input), { write: true, refresh: true, target: input => input.slug }),
  menu_delete: tool("Hapus menu", "Menghapus kartu menu SECARA PERMANEN dan langsung. confirmName harus sama persis dengan nama menu.", "mcp:write",
    async (cms, h, input) => { const done = await cms.catalog.remove(h, input.slug, { confirmName: input.confirmName }); return { success: true, slug: done.slug }; },
    { write: true, destructive: true, refresh: true, target: input => input.slug }),
  page_list: tool("Daftar halaman", "Daftar halaman tetap beserta waktu pembaruan dan revisi yang tayang.", "mcp:read",
    async (cms, h) => (await cms.pages.list(h)).map(page => ({ pageKey: page.key, publishedRevisionId: page.publishedRevisionId, updatedAt: page.updatedAt }))),
  page_get: tool("Baca halaman", "Membaca isi halaman terkini; hasilnya dibutuhkan (id, version) untuk page_save.", "mcp:read",
    async (cms, h, input) => pageView(await cms.pages.current(h, knownPage(input.pageKey))), { target: input => input.pageKey }),
  page_save: tool("Simpan halaman", "Menyimpan isi halaman sesuai templat tetap. Gunakan id dan version dari page_get. Langsung tayang.", "mcp:write",
    async (cms, h, input) => pageView(await cms.pages.saveCurrent(h, { ...input, pageKey: knownPage(input.pageKey) })), { write: true, refresh: true, target: input => input.pageKey }),
  media_list: tool("Daftar media", "Daftar metadata aset media (48 per halaman). Tidak mengembalikan isi berkas.", "mcp:read",
    (cms, h, input) => cms.media.list(h, input)),
  media_get: tool("Detail media", "Metadata satu aset media. Tidak mengembalikan isi berkas atau lokasi penyimpanan.", "mcp:read",
    (cms, h, input) => cms.media.meta(h, input.id), { target: input => input.id }),
  media_register_youtube: tool("Daftarkan video YouTube", "Mendaftarkan video YouTube sebagai aset media, dengan poster gambar yang sudah ada.", "mcp:write",
    (cms, h, input) => cms.media.youtube(h, input), { write: true, refresh: true, target: (_input, result) => result?.id }),
});
export const toolNames = Object.freeze(Object.keys(tools));

export const listTools = () => toolNames.map(name => {
  const { $schema: _schema, ...inputSchema } = z.toJSONSchema(schemas[name], { io: "input" });
  return { name, title: tools[name].title, description: tools[name].description, inputSchema, annotations: tools[name].annotations };
});
