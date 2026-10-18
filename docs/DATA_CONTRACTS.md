# Conceptual Contracts — DO NOT mistake for confirmed platform API schema

## Current language and editing contract (ADR-034)

> DIAMANDEMEN ADR-038 (2026-10-18): rute publik tanpa prefix bahasa; `/id`, `/en`, dan semua turunannya adalah 404 biasa tanpa alihan. Kalimat tentang `/id` stabil, redirect `/en`, dan `/id` 308 di bawah bersifat historis.

> DIAMANDEMEN penghapusan kode bahasa (2026-10-18): kode aplikasi, API, UI, dan test tidak lagi memodelkan bahasa. Bagian di bawah yang menyebut bilingual, ID/EN, `locale`, `altEn`/`captionEn`, atau `/id` `/en` adalah historis kecuali tercantum di bagian "Kontrak satu bahasa" berikut.

## Kontrak satu bahasa (berlaku sejak 2026-10-18)

- Tanpa parameter, prop, atau field `locale`/`lang` pada fungsi JS, pembaca publik, payload request/response API, dan UI. `readPublicCatalog(client)`, `readPublicPage(client, key)`, `getPublishedPage(db, { pageKey })`, `validatePageFields(pageKey, fields, { ready })`, `savePageTranslation({ revisionId, expectedVersion, fields })`.
- Penyimpan terjemahan katalog (`save*Translation`) tidak menerima `locale`; menulis baris Indonesia saja. Issue kesiapan katalog berbentuk `{ code, entityType, entityId }` (tanpa `locale`, tanpa `INVALID_LOCALE`).
- API CMS halaman: `PUT /api/cms/pages/by-key/:key` dan batch tidak menerima `locale`; operasi media tidak menerima `altEn`/`captionEn` (field tak dikenal ditolak 400 oleh `exactInput`). Pembacaan halaman mengembalikan `fields` (objek template) sebagai pengganti `translations`; `mediaRefs` hanya memuat `id, revisionId, productId?, assetId, altId, captionId, sortOrder`.
- Keluaran publik: halaman `{ pageKey, template, revisionId, version, fields, media }`; media `{ id, productId?, sortOrder, alt, caption, asset, poster }`. Tanpa `locale`, `altEn`, `captionEn`.
- Tautan internal rich text hanya path kode tanpa prefix (`/menu`, `/about`, `/`). `/id/...` dan `/en/...` ditolak validasi (tautan lama pada data tersimpan dibiarkan dan menghasilkan 404).
- Lapisan data yang terkunci skema (tanpa migrasi): kolom `locale text NOT NULL` pada enam tabel terjemahan (nilai selalu `'id'`, satu konstanta `src/server/db/stored-language.mjs`), kolom `alt_en`/`caption_en` (default `''`), serta fungsi SQL `public_read_catalog(p_locale)`/`public_read_page(p_key, p_locale)` yang dipanggil dengan `'id'`.
- Baris `en` dan `alt_en`/`caption_en` terisi pada snapshot lama: loader graf tetap memuatnya dan daftar kolom hash tidak berubah (hash tidak berubah, dijaga test golden `tests/unit/legacy-hash-golden.test.mjs`); validasi/kesiapan mengabaikan baris non-`id` (tidak menolak); klon draft menyalin baris `id` dan teks `id` saja; keluaran API/publik tidak memuatnya.

Public content and CMS authoring are Indonesian-only. No English switch, alternate language output or automatic translation provider is used. Legacy English rows remain within immutable snapshots and hashes; new content requires only Indonesian. Draft saves batch bounded edits/media references into one transaction under an exact root version lock. No workflow transition may be smuggled into that batch.

> USANG untuk katalog (ADR-037) dan halaman (ADR-036): Approval ADR-035, jadwal, dan "Schedules use Asia/Jakarta" tidak berlaku; scheduling dihapus. Staff dan Owner menyimpan langsung tayang; Hapus produk hanya Owner.

ADR-035 adds a distinct Owner approval command after Save all. It checks current database membership, exact version/hash and readiness, then atomically submits/approves/publishes or schedules the same revision. Staff cannot invoke this command. Invalid schedules, conflicts and failed readiness roll back the complete transition; a save batch cannot contain approval or publication commands.

Current override ADR-036: website page reads/writes use a stable page key and
an exact previous snapshot ID/version token. GET never writes. Save validates
the entire page/media graph and replaces the live pointer in one transaction
for enabled Owner or Staff, recording the actual actor. Existing receipt/hash
tables are maintained internally rather than exposed as editorial steps. Old
revision URLs redirect to the current page editor. Schedule HTTP entrypoints
are retired; old jobs/history persist and are cancelled when superseded by a
direct page save. Catalog permission boundaries otherwise remain unchanged.

## Earlier conceptual entities (not an implemented schema)

`User(id,email,role,status,createdAt)`; `Session(userId,issuedAt,lastActiveAt,expiresAt)`; `AuditEvent(actor,action,target,revision,time,metadata)`; `ContentPage(id,type,slug,status,publishedRevisionId)`; `PageRevision(id,pageId,fields,createdBy,approvedBy,approvedAt,scheduledFor,version)`; `Media(id,type,storageKey,mime,size,alt,posterKey,owner)`; `Product(id,slug,category,basePrice,media)`; `ProductTranslation(productId,locale,title,description,seo)`; `ModifierGroup(id,productId,min,max,selectionType)`; `ModifierOption(id,groupId,title,priceDelta)`; `MerchantMapping(productId,platform,externalId,verifiedProductUrl,verifiedStoreUrl,lastSyncHash)`; `SyncRun(id,initiator,platform,status,attempt,idempotencyKey,requestSummary,finishedAt,errorCategory)`; `PlatformSettings(platform,isEnabled,connectionStatus)`. Define real DB constraints and normalized relations during schema design.

## Invariants
- No merchant platform UI/API fields should be assumed identical; independent adapters convert from CMS canonical model.
- No numeric inventory quantity. URL fallback only to real verified store links, never fabricated deeplinks.
- `price` and modifier deltas stored as integer IDR amounts, never floating-point currency.
- Product data changes create a versioned candidate requiring Owner approval before sync; saved draft never triggers sync.
- Approval tied to revision hash/id. Concurrent edits require conflict detection.
- Synchronization returns per-platform status; queue job includes explicitly approved immutable payload snapshot.
- Platform on/off is permission-restricted, separately logged; default OFF prior to verified authorized access.

## GA4 minimal measurement plan (proposed contract)
- Standard page views plus `view_item` with stable item identifier.
- Custom `click_order` event with `item_id` (if product-specific), `platform` (`gofood`/`grabfood`), `source_page` (non-PII path), `placement` (CTA placement) [parameter `locale` dihapus, ADR-038; ShopeeFood hanya link tersimpan di CMS (ADR-037), bukan nilai `platform` event sampai ditampilkan publik dan kontrak ini diperbarui]; event ini hanya niat order keluar, bukan pesanan selesai; use GA4 acquisition and approved campaign UTMs. Register appropriate custom dimensions in GA4 as necessary.
- Do not send user's email, name, phone, cookies or other personal information as custom params.
- Prevent duplicate analytics events across generic outbound tracking and custom CTA tracking.
- `click_order` represents a click, NEVER a paid order or completed purchase.

## Historical bilingual routing (superseded by ADR-034 and ADR-038; no longer applies)
`/id/...` and `/en/...` with shared slugs were approved in ADR-002/003 and are
implemented for the public preview. Production canonical/hreflang/sitemap and
verified public content remain future work; the preview remains noindex.

## Phase 2A catalog/content contracts (approved design direction)

> USANG sejak ADR-037 (2026-10-18): varian/kategori/modifier dihapus dari admin/API/publik; skema dihapus tahap 2. Kontrak hidup: product {slug, nama, deskripsi, harga IDR, gambar{assetId,alt}, grabfoodUrl, gofoodUrl, shopeefoodUrl}. Lihat bagian "ADR-037" di akhir dokumen.

This section refines the earlier entity sketch; it is not SQL or a platform API
contract. See PHASE2_PLAN.md and ADR-006. Final constraints and migrations require
implementation review before execution.

| Concept | Contract |
|---|---|
| Category/Product identity | Stable ID and shared slug; revision-specific fields never overwrite a live version |
| CatalogRevision | Complete versioned catalog graph; draft edits use a concurrency token; submitted/approved snapshots are immutable (ADR-037: purge menghapus snapshot lama via catalog_purge_product) |
| Revision children | Category, product, variant, translation, modifier and link rows belong to one revision; references cannot cross revisions |
| Catalog publication | Singleton published-revision pointer; update atomically only to an exactly approved revision |
| Approval | Revision ID/hash, actor and timestamp; changed payload requires a new draft and new approval |
| Page/PageRevision | Stable template identity plus versioned allowed fields (one Indonesian row per revision in the stored translations table) and separate published pointer |
| Media reference | Immutable storage reference plus metadata; no in-place mutation/deletion of assets referenced by live content (ADR-037: purge produk tidak menyentuh aset media) |
| Ordering link | Platform, verified URL/scope and verification evidence; verified product URL else verified store URL; no fabricated fallback |

### Price and modifier validation

- Currency is IDR. Base amounts and deltas must be bounded safe integers;
  fractional, non-finite and overflow values fail validation. Final total must
  be valid and nonnegative. Exact bounds and permitted negative deltas need
  confirmation before implementation.
- A variant must belong to the selected product in the same revision. Its base
  amount plus allowed modifier deltas determines final cost; never accidentally
  add both product and variant base prices. The no-variant representation is an
  implementation decision that must be documented in the schema proposal.
- Group constraints require nonnegative integer min/max with min <= max and a
  feasible number of selectable options. Single/multiple selection rules must
  agree with those limits. Validate ownership, uniqueness and all limits on the
  server. Repeatable-option policy remains unconfirmed.
- Price equality validation compares equivalent variants/modifier selections,
  not base price alone. External price truth/API access is unavailable: mark
  reconciliation unverified rather than claiming equality or making live calls.
- No inventory quantity or on-site checkout/order contract is introduced.

### Approval and public-read boundaries

Staff may draft/submit; only Owner may approve/reject/publish/schedule/archive.

> Diselaraskan ADR-036/037: halaman dan katalog disimpan langsung tayang oleh Owner dan Staff aktif; hanya Hapus produk katalog yang eksklusif Owner; scheduling dihapus.
The future server must enforce this independently of the UI. Any edit after
submission/approval creates a new candidate without approval; live content
persists until an approved replacement is published. Auth identity foreign keys
remain pending library selection, not a reason to implement custom auth now.

Public reads follow published pointers and include only the referenced revision
and verified localized fields. Never select a draft because it is newer. Missing
or unpublished detail slugs return 404; any empty-catalog preview fallback must
be explicit and clearly labeled. Publication/cache invalidation must not expose
unapproved replacements. Schedules use Asia/Jakarta and idempotent, atomic
transitions. Sanitization, upload limits and RBAC remain required future gates.

## Phase 2B1 draft catalog schema (2026-10-16)

> Historis/usang sejak ADR-037 (2026-10-18): varian/kategori/modifier dihapus dari admin/API/publik; skema dihapus tahap 2.

ADR-009 approves the JS schema and generated SQL for review, not execution.
Names below refer to the seven tables defined in `src/server/db/schema.mjs`.
No public read path uses them yet.

| Table | Fields and identity |
|---|---|
| catalog_revisions | UUID id, status restricted to draft, positive integer version (default 1), timestamptz created_at |
| categories | UUID id, globally unique category slug |
| products | UUID id, globally unique product slug |
| category_entries | Composite PK (revision_id, category_id), nonnegative integer sort_order |
| product_entries | Composite PK (revision_id, product_id), category_id, nonnegative integer sort_order |
| category_translations | Composite PK (revision_id, category_id, locale), title, description |
| product_translations | Composite PK (revision_id, product_id, locale), title, description |

UUID identities default to PostgreSQL's gen_random_uuid(). Slugs use lowercase
ASCII letters/digits separated by single hyphens, matching existing shared-route
conventions. Category/product slug uniqueness is separate; the same identifier
may occur in both namespaces. Slugs do not contain locale-specific copies.

Entries reference stable identities. Product entries reference category entries
using BOTH revision_id and category_id. Translation rows reference their entry
using revision_id plus the appropriate identity. This prevents child references
from crossing revisions. All six foreign keys use RESTRICT for update/delete;
removal must explicitly handle children. Product/category lookup has a composite
index on product_entries(revision_id, category_id).

The stored locale value is always id (the schema still allows id/en). Titles must contain content after PostgreSQL btrim
removes ordinary surrounding spaces; description defaults to empty text. This
is not full Unicode whitespace validation, rich-text sanitization, translation
verification or proof that a translation exists. A future submit/publish validator
must require the necessary Indonesian fields and safe content. No sample facts
or production menu values are inserted.

The version column is only a concurrency token foundation: the future write
service must compare expected version and increment atomically. A DB default
does not implement conflict handling or automatic version increments. No approval
records, revision freeze triggers, published pointer, actor/auth foreign keys,
permissions service or CMS endpoints exist in 2B1. Only draft status is accepted;
this graph MUST NOT become a public source until approval/publication protection
and its denial tests are implemented. Stable identity/slug changes also need
protection before live revisions can exist.

Prices, variants, modifier rules, media, verified merchant links and fixed page
revisions remain separate steps of the approved overall design. This foundation
does not redefine those requirements or imply Phase 2 is complete. Constraint
behavior in PostgreSQL must be tested after a separately approved local migration.

## Phase 2C1: pricing/variants/modifiers (2026-10-16)

> Historis/usang sejak ADR-037 (2026-10-18): varian/kategori/modifier dihapus dari admin/API/publik; skema dihapus tahap 2.

The user replaced the previously discussed IDR 100000 ceiling with NO business
price ceiling before implementation. Use nonnegative integer IDR amounts in
PostgreSQL bigint, mapped to JS numbers. Storage CHECKs cap individual amounts at
9007199254740991 (Number.MAX_SAFE_INTEGER), a technical representation boundary.
The pricing validator checks remaining safe range BEFORE each addition and rejects
an overflowing final selection. It never clamps, rounds or coerces input prices.
Negative deltas and repeatable options are not supported by the approved policy.

Six revision-owned tables extend the draft foundation:

| Table | Contract |
|---|---|
| product_variants | PK revision/product/id; code unique per product revision; base_price; sort_order |
| variant_translations | title/description (stored locale id); FK revision/product/variant |
| modifier_groups | PK revision/product/id; unique code; single/multiple; min/max selections; sort_order |
| modifier_group_translations | title/description (stored locale id); FK revision/product/group |
| modifier_options | PK revision/product/group/id; code unique per group; option ID also unique per product revision; price_delta; sort_order |
| modifier_option_translations | title/description (stored locale id); FK revision/product/group/option |

All six new FKs use RESTRICT update/delete and include revision/product scope.
Groups apply to every variant of their product. There is no product-level base
price to accidentally add to the selected variant price. A simple product uses
one internal variant with code standard; this representation is validated for
pricing readiness, not automatically seeded. Multiple variants require an explicit
selection. Standard is an internal code, not verified public product content.

Storage permits incomplete drafts. SQL checks local min/max ordering, single
selection max <= 1, nonblank ordinary-space-trimmed titles, code
format, amount bounds and nonnegative sort order. Cross-row readiness (at least
one variant, standard for a simple product, enough options for configured max)
is checked by validatePricingProduct. Publication still needs its own full
content, immutable-revision and approval validation. No such workflow
or runtime write grant is introduced by this step.

Pure module src/server/catalog/pricing.mjs accepts a server-loaded graph:
product { revisionId, productId, variants, groups }; each variant/group/option has
id, revisionId, productId and code. Variants carry basePrice; groups carry
selectionType, minSelections, maxSelections and nested options. Each option has
groupId and priceDelta. calculatePrice(product, selection) takes selection scope,
optional variantId (only inferred for a simple product) and optionIds (default []).
It validates the entire pricing graph, rejects duplicate/unknown choices and
invalid ownership, enforces every group including omitted required groups, and
returns an exact safe integer total. Client-supplied amounts must never be used
as this trusted graph. Future endpoints must load data and enforce auth or
published-only access independently. This module is not an order/checkout API.

0001_catalog_pricing.sql is generated/reviewed OFFLINE only. Both DBs still have
only foundation 0000; their guarded migration runners intentionally reject the
new journal/files until separately reviewed updates and migration approval.
Do not bypass guards or run drizzle-kit push. Merchant price comparison remains
unverified; this step makes no equality claim or external call.

## Phase 2D1: internal draft writer and optimistic concurrency (2026-10-16)

src/server/catalog/drafts.mjs is server-only and accepts an explicitly supplied
Drizzle DB/transaction context. It neither connects nor grants permissions.
createCatalogDraft(db) inserts an empty catalog_revisions row with DB-generated
UUID, draft status, version 1 and timestamp. It does not copy another catalog or
create category/product/translation rows, approval records or published pointers.

updateVariantPrice(db, { revisionId, productId, variantId, expectedVersion,
basePrice }) validates UUID syntax, version 1..2147483646 and nonnegative safe
integer IDR amount before touching the DB. No business price ceiling is added.
Inside one transaction it conditionally increments the revision version only
when id/status=draft/expectedVersion match, then updates the exact scoped variant.
Both changes commit together; missing/wrong-scope variant errors roll back the
version increment. Every successful save, including unchanged amounts, increments
version. The last writable token advances to 2147483647; further edits are refused
before integer overflow and require future revision/recovery planning.

Error codes: INVALID_INPUT, REVISION_CONFLICT (missing/unavailable/stale draft),
VARIANT_NOT_FOUND, PERSISTENCE_FAILED. Unexpected driver errors are replaced with
a fixed message without raw parameters, connection details or attached causes.
A stale caller must reload/review, not automatically retry over newer content.

Compare-and-increment locks the revision, so two concurrent writer calls with the
same version cannot both succeed. This applies to writers that use this contract;
raw SQL/other future writers are not automatically protected. Currently only
variant base-price edits implement it. Future child writers must share the root
version transaction contract. App has no new grants or routes. Auth/Owner/Staff
checks must wrap this persistence operation before it is exposed operationally.
The draft-only schema has no approved/published states; this step is not revision
freezing, full catalog copying, approval invalidation, publication or a CMS UI.

## Phase 2D2: copying a catalog draft (2026-10-16)

> Historis/usang sejak ADR-037 (2026-10-18): varian/kategori/modifier dihapus dari admin/API/publik; skema dihapus tahap 2.

cloneCatalogDraft(db, { sourceRevisionId, expectedSourceVersion }) validates UUID
and source version 1..2147483647 before DB access. It accepts only the exact draft
source version. A FOR SHARE lock on the root persists for the transaction, blocking
compliant root-update writers without incrementing the source version. A source
that changed while the copier waited is rejected with REVISION_CONFLICT.

Within the same transaction a new UUID root is inserted with draft/version 1/new
timestamp, followed by INSERT SELECT of explicitly whitelisted fields in all ten
revision-child tables in FK order. Only revision_id changes in copied child rows;
variant/group/option IDs are retained within their revision-scoped keys. Category
and product identity/slug rows are shared, not duplicated. No root version/time,
approval, published pointer, auth actor or future unlisted fields are inherited.
The return value is the fresh root; no persistent lineage column is introduced.

Copying is content-preserving, not a readiness/publish validator: empty drafts and
missing translations remain empty/missing. A source at int4 version exhaustion
may be cloned into a fresh version-one draft. Unexpected SQL failures roll back
all copied rows and root and become sanitized PERSISTENCE_FAILED errors. Nested
Drizzle transactions/savepoints preserve atomicity within an enclosing transaction.

Only compliant writers use the root-lock/version convention. Direct SQL and shared
identity/slug changes are not frozen by this function. Source status is currently
draft-only; future approved/live copying, RBAC/audit/publication require separately
reviewed protections. Runtime app still cannot use the internal persistence context.

## Phase 2D3: category/product plain-text translations (2026-10-16)

> Historis/usang sejak ADR-037 (2026-10-18): varian/kategori/modifier dihapus dari admin/API/publik; skema dihapus tahap 2.

saveCategoryTranslation(db, { revisionId, categoryId, expectedVersion,
title, description }) and saveProductTranslation(db, { revisionId, productId,
expectedVersion, title, description }) are internal server-only writers.
They validate UUIDs, writable int4 version, nonblank title
using JS trim for validation, and string description. Empty description is valid;
null/omitted description is rejected instead of silently clearing existing text.
NUL characters are rejected because PostgreSQL text cannot represent them.
Content is preserved verbatim, including outer spaces, Unicode, newlines and
HTML-like literal characters. This is plain-text storage, not rich-text parsing
or HTML sanitization; future rendering must escape text and never insert it as HTML.

A shared advanceDraftVersion helper is used by price and both translation writers.
Inside a transaction, compare/increment the draft root, check that the referenced
category/product entry exists in that revision, then upsert only title/description
for the exact revision/identity composite key (stored locale id). Legacy rows of other locales and
other revisions, root status and shared identity/slug stay unchanged.
Unknown extra input properties are not persisted. Missing parent returns
ENTRY_NOT_FOUND with root increment rolled back. Stale/missing root conflicts and
all SQL failures likewise preserve data/version atomically. Every successful save
increments once, including unchanged text. Validation failures happen before DB.

Only category/product translations are writable here. Variant/modifier labels,
product/category creation, rich text, auth/RBAC/audit, publish-readiness,
approval and public routes remain separate work. Runtime app grants remain denied;
future endpoints must authorize a least-privilege context. Root-version protection
still requires every child writer to follow the same transaction contract.

## Phase 2D4: versioned variant and variant-translation writers (2026-10-16)

> Historis/usang sejak ADR-037 (2026-10-18): varian/kategori/modifier dihapus dari admin/API/publik; skema dihapus tahap 2.

createProductVariant(db, { revisionId, productId, expectedVersion, code, basePrice,
sortOrder }) inserts a DB-generated variant UUID. Caller-supplied extra fields,
including variantId/status/slug, are not persisted on creation. updateProductVariant
requires the same fields plus variantId and updates only code/basePrice/sortOrder
for that revision/product/variant. UUID comparisons accept upper/lower hex input.

Both validate writable root version, lowercase hyphen-separated code, nonnegative
safe integer IDR amount and int4 sort_order 0..2147483647 before touching the DB.
No business price ceiling. In one transaction, advance the root token, verify the
product entry and inspect its variants under that root lock. First creation and
sole-variant edits must keep code standard; additional variants may have distinct
named codes. When multiple variants exist, standard may be renamed. This is not
a removal API: no deletion or automatic promotion/renaming of siblings is included.
Code conflicts return VARIANT_CODE_CONFLICT; first/sole violations return
VARIANT_RULE_VIOLATION; all rule/scope failures roll back the root increment.

saveVariantTranslation(db, { revisionId, productId, variantId, expectedVersion,
title, description }) validates full scope, version and the same plain-text
rules as category/product translations. Parent variant must exist in this exact
product/revision. Upsert only title/description for the composite key;
legacy other-locale rows, other revisions and variant identity/prices/code/order remain unchanged.
Return version and saved fields. Shared text validation preserves literal content,
rejects empty names/NUL and permits an explicit empty description; not HTML parsing.

All three writers share advanceDraftVersion with existing price/text writers.
Duplicate/concurrent/stale/missing/scope failures are atomic and unexpected driver
errors remain sanitized. Product creation, deletion, modifier writing, UI/auth,
approval/publication and stable slug freeze are separate work. Runtime grants stay
denied; root locking protects compliant writers, not arbitrary SQL.

## Phase 2D5: versioned modifier groups/options and localized labels (2026-10-16)

> Historis/usang sejak ADR-037 (2026-10-18): varian/kategori/modifier dihapus dari admin/API/publik; skema dihapus tahap 2.

createModifierGroup/updateModifierGroup accept revisionId, productId,
expectedVersion, code, selectionType, minSelections, maxSelections, sortOrder
(and groupId for update). New group ID is DB-generated. Code is unique per
revision/product. Integers satisfy 0 <= min <= max <= 2147483647; single selection
max <= 1; sort is nonnegative int4. Existing product entry is required. Incomplete
draft option counts are allowed; validatePricingProduct still enforces max/count
feasibility and rejects underfilled groups before pricing readiness.

createModifierOption/updateModifierOption accept revisionId, productId, groupId,
expectedVersion, code, priceDelta, sortOrder (and optionId for update). Full parent
group scope is required. New ID is generated; option code is unique within its
group, not across other groups. Delta is nonnegative integer IDR in JS-safe range
without business price ceiling. Edits affect only code/delta/sort, never parent
product/revision/group or ID. No repeatable option policy or deletion is added.

saveModifierGroupTranslation/saveModifierOptionTranslation accept their full
revision/product/group/(option) scope, expectedVersion, title, description.
Use existing literal-text rules and exact scoped upsert; only text
fields change. Required parent must exist in that scope. Root token advances
once in the same transaction as every successful group/option/label write.
Rule, code, parent/scope, stale or SQL failures roll back both child and token.

New errors: MODIFIER_GROUP_NOT_FOUND, MODIFIER_OPTION_NOT_FOUND,
MODIFIER_GROUP_CODE_CONFLICT, MODIFIER_OPTION_CODE_CONFLICT. Existing INVALID_INPUT,
ENTRY_NOT_FOUND, REVISION_CONFLICT and sanitized PERSISTENCE_FAILED still apply.
Parent ownership is not an editable field; a request referencing another group
cannot move an option. Shared codes in different groups are valid and use distinct
option IDs. Runtime grants remain denied and all functions require an authorized
internal server context before exposure. No inventory/checkout/sync/auth/approval
or public data integration is implemented. Literal text needs escaped rendering.

## Phase 2D6: completed draft foundation package (2026-10-16)

createCatalogCategory(db, { revisionId, expectedVersion, slug, sortOrder }) and
createCatalogProduct(db, { revisionId, expectedVersion, slug, sortOrder, categoryId })
create a DB-generated stable UUID identity plus a revision-owned entry in one root
version transaction. Product creation requires the category entry in that exact
revision; no automatic variants/translations or fabricated facts are inserted.
Global unique slugs apply separately to category/product namespaces. A collision
returns SLUG_CONFLICT and rolls back identity/entry/root changes. Existing stable
identity is never silently attached or edited. No shared slug edit is exposed.

updateCategoryPlacement accepts revisionId/categoryId/expectedVersion/sortOrder.
updateProductPlacement also takes productId/categoryId and changes only category
placement/sort in that revision. Categories cannot be imported from another revision.
All writes use the existing root CAS and int4 sort/writable version checks; missing
entries and errors roll back the root token. There is no deletion or archive API.

validateCatalogReviewReadiness(graph) is a pure structural validator. The graph
contains revision metadata, referenced stable categories/products and all ten
revision-child arrays using schema JS names. It checks scope, identity/placement,
ID/slug/duplicate/sort, ID+EN title/description for category/product/variant/group/
option, at least one category and product, variants and modifier readiness. It
reuses validatePricingProduct and checks the highest permitted total: maximum
variant base plus top maxSelections nonnegative option deltas per independent
product-wide group. Reject unsafe sums before adding, without business price cap
or exponential combination enumeration. Empty category entries are allowed if
localized; an empty catalog is not ready. Individual descriptions may be empty.

Return { revisionId, version, ready, issues }, with deterministic deduplicated
issue objects { code, entityType, entityId }. No content/SQL/credentials
are included in issues. ready means STRUCTURE complete for review, never verified
restaurant facts, good translations, Owner approval, publication or merchant parity.

getCatalogReviewReadiness(db, { revisionId, expectedVersion }) is server-only.
It checks exact draft/version FOR SHARE and loads the ten child tables plus only
referenced identities in the same transaction, with no DML or version increment.
Row locks require a normal transaction, not PostgreSQL READ ONLY. Compliant edits
wait until the snapshot read completes. A returned report may become stale later;
future submit/approve must revalidate/freeze in its own authorized transaction.
Int4 exhausted revisions may be checked even though they can no longer be edited.
Runtime app has no new read/write grants. Raw SQL/shared-identity modification
remains outside this lock contract and needs later protections before live use.


## Phase 2 group 2: immutable review and publication backend (ADR-021)

The following extends the earlier draft-only contracts. catalog_revisions adds
content_hash and states draft, review, approved, rejected, published, archived.
Submission freezes the exact root version and all ten child tables. Version is
an editing token; workflow transitions do not increment it. Shared category and
product identities referenced by any frozen revision cannot be updated/deleted.
Database triggers lock roots for raw child writes and reject changes to frozen
content; no request-controlled bypass flag exists.

createCatalogWorkflow({ db, resolveActor }) is server-only. The trusted server
resolver must return { subject, role: "staff" | "owner" }; subject is an opaque
internal account identifier, never an email/PII payload. Missing/failed resolver,
unknown role or malformed subject denies AUTH_REQUIRED. Request fields cannot
supply identity or authority. Actual auth/session integration belongs to Phase 3;
no endpoint, UI, login, session exception or runtime grant is introduced here.

Methods take { revisionId, expectedVersion }; approve/reject/publish/archive also
require expectedHash. Staff/Owner may submit; all other transitions require Owner.
Submit loads and validates the complete Indonesian catalog/pricing graph under a root
UPDATE lock, calculates SHA-256 and inserts an immutable submission receipt.
Approve rehashes and binds an approval to that exact submitted revision/hash.
Reject freezes the source as rejected. Editing frozen content requires
cloneCatalogDraft: new draft ID/version 1/hash NULL, no copied approval or audit.
Cloning also remains available for ordinary drafts.

Hash format 1 explicitly includes root ID/version, referenced category/product
IDs/slugs and all approved columns of the ten content tables. Each row is encoded
in fixed field order; rows sort deterministically. Status, timestamps, actors and
workflow metadata are excluded. Content or scope changes alter the hash.

Publish rechecks the submission, content hash and approval in one transaction,
then updates the singleton catalog_publication pointer and appends an audit event.
A transaction advisory lock serializes publication/archival, including first
publication with no existing pointer. Repeating publish for the current revision
is idempotent without duplicate audit. Historical publication must be cloned and
reviewed again before republishing. published on the root means it has been
published; only the pointer identifies the current live snapshot.

Archive accepts nonlive approved/rejected/published revisions and preserves their
content/receipts. Archiving the current live revision or deleting the live pointer
is denied; publish an approved replacement first. Workflow event records contain
only UUID, revision, action, opaque actor subject and timestamp and are append-only.
Submission/approval receipts are immutable with deferred completion constraints.

getPublishedCatalog(db) accepts no revision ID. It follows the live pointer joined
to exact published root and approval, rechecks the hash and returns the content
graph with revision { id, version }. It returns null before first publication and
never falls back to newest draft. Audit identities/approval metadata are omitted.
The public Next.js routes still use preview fixtures until Phase 2 group 5.

Errors include AUTH_REQUIRED, FORBIDDEN, INVALID_INPUT, NOT_READY,
REVISION_CONFLICT, HASH_CONFLICT, APPROVAL_REQUIRED, LIVE_REVISION and sanitized
PERSISTENCE_FAILED. Ordinary database owners remain administrative principals;
trigger protection is not a substitute for runtime RBAC or restricted grants.
No checkout, merchant API, sync, business price cap or verified content is added.

## Phase 2 group 3: fixed page content (ADR-022; Indonesian-only since ADR-034/038)

Seven tables extend the catalog schema without altering applied 0000-0003:
pages(key,template); page_revisions(id,page_key,status,version,content_hash,created_at);
page_translations(revision_id,locale,fields jsonb); page_submissions; page_approvals;
page_publications(page_key PK,revision_id,content_hash,published_at); page_workflow_events.
All eight new FKs use RESTRICT. Publication has composite FKs to both the exact
page/revision/hash and its approval, preventing cross-page pointer substitution.

Code-owned keys: home, about, menu, guides, promos, location and guide-takoyaki,
guide-okonomiyaki, guide-burger. Singleton template matches key; the three article
keys use guide. Their existing route paths are defined in templates.mjs. No dynamic
route/page builder, shared identity mutation or arbitrary editor template choice.

All templates share eyebrow, title, summary, seoTitle, seoDescription (plain text)
and body (rich document). Home additionally has menuTitle/menuIntro/aboutTitle,
aboutBody rich document and primaryCtaLabel/secondaryCtaLabel; CTA targets stay in code.
About additionally has storyHeading/storyBody and serviceHeading/serviceBody, with
body suffixes rich documents. Location additionally has city/service (short text),
hours/coverage (summary text). Other templates use the common fields. This is storage
for reviewed content, not fabricated business facts, automatic translation or a
promotion scheduling/merchant operation system. Media references are group 4.

Technical text caps: short 160, title 240, summary 2000 JS string units. Strings
cannot contain NUL. Draft fields may be absent/empty; submission requires every
allowed field nonblank (or visible rich content) in Indonesian. Unknown fields
including layout/style/template keys are rejected. Legacy non-Indonesian rows are ignored.

Rich JSON document: { blocks: [...] }; blocks are paragraph {type,content},
heading {type,level:2|3,content}, or list {type,ordered:boolean,items:[inline,...]}.
An inline is an array of {text,marks?,href?}; marks contain unique bold/italic.
href must exactly match an existing code-owned page path without any language prefix.
External/protocol-relative URLs, schemes, query/fragment, encoded/traversal paths
and unsupported product detail links are denied. No raw HTML/media/embed/style node.
Literal angle brackets are text; future renderer must use safe React text nodes,
never dangerouslySetInnerHTML. No browser renderer/editor is installed in this group.

Bounded flat shape: max 100 blocks, 100 inline spans per array, 100 list items,
1000 spans per document and 4000 units per span text. Serialized input max 65536
UTF-8 bytes per page; DB requires jsonb object and <=131072 formatted bytes.
Node allowlists avoid recursive HTML parsing and reject unsupported structures.

createPageWorkflow({db,resolveActor}) is the authorized write boundary. Trusted
server actor {subject,role:staff|owner} must come from the future auth provider.
Unwired/error/invalid actor fails AUTH_REQUIRED; request identity/roles are ignored.
Internal drafts.mjs primitives are server-only persistence helpers, not HTTP APIs.
No runtime grants or actual auth/session endpoints are introduced.

createDraft({pageKey}); saveTranslation({revisionId,expectedVersion,fields});
cloneDraft({sourceRevisionId,expectedSourceVersion}); submit({revisionId,expectedVersion})
are Staff/Owner actions. approve/reject/publish/archive add expectedHash and require
Owner. Save replaces the Indonesian fields object, advances version once, and locks root
FOR UPDATE in the same transaction. Missing/stale/frozen revisions conflict. Clone
locks exact source FOR SHARE, copies only the Indonesian translation row (and Indonesian media text) to a new draft UUID/version 1
with hash NULL and no inherited receipt/approval/audit. Exhausted versions can clone.

Submission validates the Indonesian row (legacy rows ignored) then freezes exact root version and computes SHA256.
Hash format 1 binds page key/template, revision ID/pageKey/version and every stored
translation row including its locale column and fields (unchanged format; old snapshots with English rows keep their hash). JSON object keys and rows sort deterministically;
block/span/list order remains meaningful. Status/timestamps/actors are excluded.
Every workflow transition and published read revalidates structure and integrity.

States: draft -> review -> approved/rejected; approved -> published/archived;
rejected/published -> archived. Frozen content/version/root identity cannot change.
Submit/approval receipts have deferred completion checks; receipt and audit updates/
deletes are denied. Raw child writes lock old/new roots and reject frozen changes.
Page identity updates and catalog/page TRUNCATE are denied. Privileged database owners
remain administrators; there is no request flag, SECURITY DEFINER or runtime bypass.

Publish/archive lock page advisory key before root; per-page pointer changes are
atomic even on first publication. Current live publish retry is idempotent, without
duplicate audit. Historical publication requires a fresh reviewed clone. Live archive
or pointer deletion is denied until a replacement is published. Audits store action,
revision, opaque server actor subject, UUID and timestamp without content/PII.

getPublishedPage(db,{pageKey}) accepts no revision selector. Returns null when
not published; otherwise {pageKey,template,revisionId,version,fields,media}.
Unknown key is INVALID_INPUT; group 5 handles route/404 mapping.
Approval/audit identities are omitted. Public routes remain fixture/noindex now.

Errors: AUTH_REQUIRED, FORBIDDEN, INVALID_INPUT, INVALID_CONTENT, NOT_READY,
REVISION_CONFLICT, HASH_CONFLICT, APPROVAL_REQUIRED, LIVE_REVISION, PERSISTENCE_FAILED.
Raw driver errors and credentials are never included. Template evolution must preserve
approved document/hash contracts through an explicit later reviewed change.

## Phase 2 group 4: immutable media references (ADR-023)

media_assets stores UUID, kind (image/video/youtube), opaque unique storage_key,
MIME, byte_size, width/height, duration_ms, SHA256 checksum, external_id, poster_id
and created_at. Every UPDATE/DELETE is denied, even if unreferenced. Register new
assets instead of overwriting. Self FK poster must select a registered image; no
video poster chains/cycles. media_events records register action, asset and opaque
actor subject/time, append-only. No delete/retire API or physical file operation.

Approved decimal limits: image JPEG/PNG/WebP <=10,000,000 bytes, each side <=4096;
video MP4/WebM <=100,000,000 bytes, duration 1..120000 ms, long side <=1920 and
short side <=1080. Stored files require positive dimensions/bytes, lowercase SHA256,
UUID.ext key matching detected MIME. Images have no poster/duration/external ID;
videos require image poster. No SVG/GIF/HTML or arbitrary filename/path/URL.

YouTube is a normalized external ID contract: exactly 11 ASCII letters/digits/_/-,
poster image required, all file metadata NULL. Validation is syntactic and does
not establish existence, duration, ownership, embedding permission or restaurant
claims. There is no URL fetch, API call, iframe parsing or remote thumbnail import.
The provider uses a video ID in its embed contract; see the primary reference:
[YouTube Embedded Players and Player Parameters](https://developers.google.com/youtube/player_parameters).
The 11-character acceptance rule is this application policy, not a universal claim
about every possible future provider identifier. Rendering/consent remains group 5.

createMediaAssets({db,resolveActor,inspectFile}) offers registerFile({storageKey,
posterId?}) and registerYoutube({videoId,posterId}). Auth resolver must be trusted
server code returning opaque subject and staff/owner; missing/invalid/error denies
AUTH_REQUIRED. Request actor/role/MIME/size/checksum/verified cannot grant access.

File inspector is an injected server capability, called with opaque key and frozen
{subject,role} from the trusted resolver. It must authorize the object for that actor,
inspect actual bytes/decoded MIME/dimensions/duration/checksum, enforce safe storage
and return {storageKey,verified:true,mime,byteSize,width,height,durationMs,checksum}.
Metadata validation checks this exact key and approved policy before persistence.
Absent adapter denies INSPECTION_REQUIRED; failure or unverified/wrong-key result
denies INSPECTION_FAILED. This stage provides no physical inspector, codec, upload
endpoint, storage service or proof that a real file was inspected. Test adapters
are explicitly synthetic. The future adapter must provide immutable write-once
keys, byte integrity and ownership enforcement; database guards protect metadata
only and cannot stop privileged external storage changes.

catalog_media_refs and page_media_refs use composite (revision_id,id) PK and asset
FK, alt_id/alt_en (<=500), caption_id/caption_en (<=2000), sort_order nonnegative.
(alt_en/caption_en are legacy columns: never written by the application, default empty, still part of the media hash.)
Catalog additionally has product_id and composite FK to exact revision/product.
No numeric inventory or media tokens/styles enter templates. Alt labels apply to
images and accessible video labels/posters; caption may be empty. The alt label
must be nonblank before submission. Draft labels may be incomplete. Literal text
needs safe React rendering later; no HTML insertion is introduced.

createMediaReferences({db,resolveActor}) exposes saveCatalog/savePage and
removeCatalog/removePage to trusted Staff/Owner. Inputs require revisionId,
expectedVersion (1..2147483646), assetId for save and referenceId for edit/remove;
catalog also requires productId. Save includes altId, captionId and
sortOrder. References cannot be reparented; remove then attach to the other draft.
Each successful create/edit/remove increments root version once in its transaction.
Missing/stale/frozen scope or SQL failure rolls back child and version together.

At most twelve references per product/page. SQL triggers lock the parent FOR UPDATE,
check frozen state and serialize count checks even for independent raw INSERTs.
Application writers lock the root first, following existing editor concurrency.
All six new FKs are RESTRICT. Raw reference identity/parent moves are rejected.
Assets/audit/refs deny TRUNCATE. Database owners remain administrative principals;
no SECURITY DEFINER, request bypass flags or runtime app grants are introduced.

Graph loaders add mediaRefs and the exact assets/posters they reference. Hash
format 1 remains byte-for-byte unchanged when no media exists (golden tests).
Nonempty media uses format 2 and binds reference scope/ID/text/order plus all
immutable asset content fields including storage key/checksum/poster/external ID.
Creation timestamps/audit actors are excluded. References/assets sort deterministically.
Clone copies scoped reference IDs/text/order onto the fresh root; assets stay shared
and immutable, while approval/receipts remain uncopied. Root submit/readiness
validates media; page transitions and both hash checks protect exact content.

Published DTOs expose asset ID/kind/dimensions/duration/external ID and poster
metadata with revision-owned labels/order. Page reader returns alt/caption
labels; catalog output includes labels and productId. Private keys,
checksums, raw media tables and registration actors are omitted. Reader delivery
is a metadata contract, not a publicly accessible upload or byte-serving endpoint.

Errors: AUTH_REQUIRED, INVALID_INPUT, INVALID_MEDIA, INVALID_POSTER,
INSPECTION_REQUIRED, INSPECTION_FAILED, ASSET_NOT_FOUND, ENTRY_NOT_FOUND,
REFERENCE_NOT_FOUND, REVISION_CONFLICT, MEDIA_LIMIT and sanitized PERSISTENCE_FAILED.
Existing root workflow maps incomplete media to NOT_READY. No file deletion,
physical storage, image optimization, custom iframe HTML or automatic network sync.

## Phase 2 public application read boundary

Runtime calls public.public_read_catalog(locale) and public.public_read_page(key,
locale) with parameters; the application always passes the stored value id from one constant. Both return null without a matching live publication,
published revision and approval hash. No arbitrary revision
lookup is accepted. Catalog DTO has categories/products/variant and
modifier labels; page DTO has fixed fields and media labels. Media omits
storage key, checksum, actor and audit history. Runtime has EXECUTE only, no table
SELECT/write or Owner role membership. Privileged internal Drizzle readers remain
for workflow tests and are not the public runtime path.

One catalog JSON query is one consistent SQL statement snapshot. Pages are fresh
per request, with request-local React deduplication only; no global published-data
cache. Empty pages show honest status; detail absence is 404. Connection failure
uses a generic production error boundary and does not substitute sample content.

Displayed minimum price is the cheapest valid variant plus each group's minimum
required lowest-cost options, calculated through the existing pricing validator.
The chooser validates selections and safe-integer totals; it creates no order,
cart, payment or quantity. Real media storage/optimization remains Phase 3.

## ADR-037: katalog kartu, hapus permanen, gambar, link order (2026-10-18)

- Tabel `catalog_deletion_log` (append-only; peran CMS SELECT saja): aktor, waktu, slug, nama. Fungsi `catalog_purge_product` (migrasi 0014, SECURITY DEFINER, eksekusi peran CMS saja).
- Migrasi 0015: tiga kolom nullable di `product_entries` untuk link GrabFood/GoFood/ShopeeFood (hanya disimpan; tidak tampil di publik; tanpa sync). Snapshot lama harus berhash identik; klon wajib menyalin kolom.
- API: `POST /api/cms/catalog` (tambah), `PATCH /api/cms/catalog/products/[slug]` (ubah), hapus produk (Owner saja); tanpa id revisi. Body dapat memuat imageAssetId, imageAlt, grabfoodUrl, gofoodUrl, shopeefoodUrl.
- Galat: `INVALID_ORDER_URL` 400, `INVALID_IMAGE_ALT`, `PRODUCT_CONFLICT` 409.
- Allowlist host link order (OFFICIAL_ORDER_HOSTS) kosong; harus diisi di server dan klien sebelum tampil publik (B-2).
