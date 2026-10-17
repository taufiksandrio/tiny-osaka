import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Importing this schema never creates database objects. Custom protection
// triggers are maintained in migration 0002, alongside these constraints.
export const catalogRevisions = pgTable("catalog_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  contentHash: text("content_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("catalog_revisions_status", sql`${table.status} IN ('draft','review','approved','rejected','published','archived')`),
  check("catalog_revisions_hash", sql`(${table.status} = 'draft' AND ${table.contentHash} IS NULL) OR (${table.status} <> 'draft' AND ${table.contentHash} IS NOT NULL AND ${table.contentHash} ~ '^[0-9a-f]{64}$')`),
  check("catalog_revisions_version_positive", sql`${table.version} >= 1`),
]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique("categories_slug_unique"),
}, (table) => [
  check("categories_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique("products_slug_unique"),
}, (table) => [
  check("products_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
]);

export const categoryEntries = pgTable("category_entries", {
  revisionId: uuid("revision_id").notNull()
    .references(() => catalogRevisions.id, { onDelete: "restrict", onUpdate: "restrict" }),
  categoryId: uuid("category_id").notNull()
    .references(() => categories.id, { onDelete: "restrict", onUpdate: "restrict" }),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  primaryKey({ name: "category_entries_pk", columns: [table.revisionId, table.categoryId] }),
  check("category_entries_sort_nonnegative", sql`${table.sortOrder} >= 0`),
]);

export const productEntries = pgTable("product_entries", {
  revisionId: uuid("revision_id").notNull(),
  productId: uuid("product_id").notNull()
    .references(() => products.id, { onDelete: "restrict", onUpdate: "restrict" }),
  categoryId: uuid("category_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  primaryKey({ name: "product_entries_pk", columns: [table.revisionId, table.productId] }),
  foreignKey({
    name: "product_entries_category_in_revision_fk",
    columns: [table.revisionId, table.categoryId],
    foreignColumns: [categoryEntries.revisionId, categoryEntries.categoryId],
  }).onDelete("restrict").onUpdate("restrict"),
  index("product_entries_category_idx").on(table.revisionId, table.categoryId),
  check("product_entries_sort_nonnegative", sql`${table.sortOrder} >= 0`),
]);

export const categoryTranslations = pgTable("category_translations", {
  revisionId: uuid("revision_id").notNull(),
  categoryId: uuid("category_id").notNull(),
  locale: text("locale").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
}, (table) => [
  primaryKey({
    name: "category_translations_pk",
    columns: [table.revisionId, table.categoryId, table.locale],
  }),
  foreignKey({
    name: "category_translations_entry_fk",
    columns: [table.revisionId, table.categoryId],
    foreignColumns: [categoryEntries.revisionId, categoryEntries.categoryId],
  }).onDelete("restrict").onUpdate("restrict"),
  check("category_translations_locale", sql`${table.locale} IN ('id', 'en')`),
  check("category_translations_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

export const productTranslations = pgTable("product_translations", {
  revisionId: uuid("revision_id").notNull(),
  productId: uuid("product_id").notNull(),
  locale: text("locale").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
}, (table) => [
  primaryKey({
    name: "product_translations_pk",
    columns: [table.revisionId, table.productId, table.locale],
  }),
  foreignKey({
    name: "product_translations_entry_fk",
    columns: [table.revisionId, table.productId],
    foreignColumns: [productEntries.revisionId, productEntries.productId],
  }).onDelete("restrict").onUpdate("restrict"),
  check("product_translations_locale", sql`${table.locale} IN ('id', 'en')`),
  check("product_translations_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

// Prices use JS-safe integers in PostgreSQL bigint; this is a representation
// limit, not a business price ceiling. Frozen revisions keep these rows intact.
export const productVariants = pgTable("product_variants", {
  revisionId: uuid("revision_id").notNull(),
  productId: uuid("product_id").notNull(),
  id: uuid("id").defaultRandom().notNull(),
  code: text("code").notNull(),
  basePrice: bigint("base_price", { mode: "number" }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  primaryKey({ name: "product_variants_pk", columns: [table.revisionId, table.productId, table.id] }),
  unique("product_variants_code_unique").on(table.revisionId, table.productId, table.code),
  foreignKey({ name: "product_variants_entry_fk", columns: [table.revisionId, table.productId],
    foreignColumns: [productEntries.revisionId, productEntries.productId],
  }).onDelete("restrict").onUpdate("restrict"),
  check("product_variants_code_format", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("product_variants_price_safe", sql`${table.basePrice} BETWEEN 0 AND 9007199254740991`),
  check("product_variants_sort_nonnegative", sql`${table.sortOrder} >= 0`),
]);

export const variantTranslations = pgTable("variant_translations", {
  revisionId: uuid("revision_id").notNull(),
  productId: uuid("product_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  locale: text("locale").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
}, (table) => [
  primaryKey({ name: "variant_translations_pk", columns: [table.revisionId, table.productId, table.variantId, table.locale] }),
  foreignKey({ name: "variant_translations_variant_fk", columns: [table.revisionId, table.productId, table.variantId],
    foreignColumns: [productVariants.revisionId, productVariants.productId, productVariants.id],
  }).onDelete("restrict").onUpdate("restrict"),
  check("variant_translations_locale", sql`${table.locale} IN ('id', 'en')`),
  check("variant_translations_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

export const modifierGroups = pgTable("modifier_groups", {
  revisionId: uuid("revision_id").notNull(),
  productId: uuid("product_id").notNull(),
  id: uuid("id").defaultRandom().notNull(),
  code: text("code").notNull(),
  selectionType: text("selection_type").notNull(),
  minSelections: integer("min_selections").notNull(),
  maxSelections: integer("max_selections").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  primaryKey({ name: "modifier_groups_pk", columns: [table.revisionId, table.productId, table.id] }),
  unique("modifier_groups_code_unique").on(table.revisionId, table.productId, table.code),
  foreignKey({ name: "modifier_groups_entry_fk", columns: [table.revisionId, table.productId],
    foreignColumns: [productEntries.revisionId, productEntries.productId],
  }).onDelete("restrict").onUpdate("restrict"),
  check("modifier_groups_code_format", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("modifier_groups_selection_type", sql`${table.selectionType} IN ('single', 'multiple')`),
  check("modifier_groups_selection_range", sql`${table.minSelections} >= 0 AND ${table.maxSelections} >= ${table.minSelections}`),
  check("modifier_groups_single_limit", sql`${table.selectionType} <> 'single' OR ${table.maxSelections} <= 1`),
  check("modifier_groups_sort_nonnegative", sql`${table.sortOrder} >= 0`),
]);

export const modifierGroupTranslations = pgTable("modifier_group_translations", {
  revisionId: uuid("revision_id").notNull(),
  productId: uuid("product_id").notNull(),
  groupId: uuid("group_id").notNull(),
  locale: text("locale").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
}, (table) => [
  primaryKey({ name: "modifier_group_translations_pk", columns: [table.revisionId, table.productId, table.groupId, table.locale] }),
  foreignKey({ name: "modifier_group_translations_group_fk", columns: [table.revisionId, table.productId, table.groupId],
    foreignColumns: [modifierGroups.revisionId, modifierGroups.productId, modifierGroups.id],
  }).onDelete("restrict").onUpdate("restrict"),
  check("modifier_group_translations_locale", sql`${table.locale} IN ('id', 'en')`),
  check("modifier_group_translations_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

export const modifierOptions = pgTable("modifier_options", {
  revisionId: uuid("revision_id").notNull(),
  productId: uuid("product_id").notNull(),
  groupId: uuid("group_id").notNull(),
  id: uuid("id").defaultRandom().notNull(),
  code: text("code").notNull(),
  priceDelta: bigint("price_delta", { mode: "number" }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  primaryKey({ name: "modifier_options_pk", columns: [table.revisionId, table.productId, table.groupId, table.id] }),
  // Option IDs are unique within a product revision, so a selection is unambiguous.
  unique("modifier_options_id_unique").on(table.revisionId, table.productId, table.id),
  unique("modifier_options_code_unique").on(table.revisionId, table.productId, table.groupId, table.code),
  foreignKey({ name: "modifier_options_group_fk", columns: [table.revisionId, table.productId, table.groupId],
    foreignColumns: [modifierGroups.revisionId, modifierGroups.productId, modifierGroups.id],
  }).onDelete("restrict").onUpdate("restrict"),
  check("modifier_options_code_format", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("modifier_options_price_safe", sql`${table.priceDelta} BETWEEN 0 AND 9007199254740991`),
  check("modifier_options_sort_nonnegative", sql`${table.sortOrder} >= 0`),
]);

export const modifierOptionTranslations = pgTable("modifier_option_translations", {
  revisionId: uuid("revision_id").notNull(),
  productId: uuid("product_id").notNull(),
  groupId: uuid("group_id").notNull(),
  optionId: uuid("option_id").notNull(),
  locale: text("locale").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
}, (table) => [
  primaryKey({ name: "modifier_option_translations_pk", columns: [table.revisionId, table.productId, table.groupId, table.optionId, table.locale] }),
  foreignKey({ name: "modifier_option_translations_option_fk", columns: [table.revisionId, table.productId, table.groupId, table.optionId],
    foreignColumns: [modifierOptions.revisionId, modifierOptions.productId, modifierOptions.groupId, modifierOptions.id],
  }).onDelete("restrict").onUpdate("restrict"),
  check("modifier_option_translations_locale", sql`${table.locale} IN ('id', 'en')`),
  check("modifier_option_translations_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

export const catalogSubmissions = pgTable("catalog_submissions", {
  revisionId: uuid("revision_id").primaryKey().references(() => catalogRevisions.id, { onDelete: "restrict", onUpdate: "restrict" }),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
  submittedBy: text("submitted_by").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("catalog_submissions_revision_hash").on(table.revisionId, table.contentHash),
  check("catalog_submissions_version", sql`${table.version} >= 1`),
  check("catalog_submissions_hash", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
  check("catalog_submissions_actor", sql`length(btrim(${table.submittedBy})) BETWEEN 1 AND 200`),
]);

export const catalogApprovals = pgTable("catalog_approvals", {
  revisionId: uuid("revision_id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  approvedBy: text("approved_by").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("catalog_approvals_revision_hash").on(table.revisionId, table.contentHash),
  foreignKey({ name: "catalog_approvals_submission_fk", columns: [table.revisionId, table.contentHash],
    foreignColumns: [catalogSubmissions.revisionId, catalogSubmissions.contentHash],
  }).onDelete("restrict").onUpdate("restrict"),
  check("catalog_approvals_actor", sql`length(btrim(${table.approvedBy})) BETWEEN 1 AND 200`),
]);

export const catalogPublication = pgTable("catalog_publication", {
  id: integer("id").primaryKey().default(1),
  revisionId: uuid("revision_id").notNull(),
  contentHash: text("content_hash").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("catalog_publication_singleton", sql`${table.id} = 1`),
  foreignKey({ name: "catalog_publication_approval_fk", columns: [table.revisionId, table.contentHash],
    foreignColumns: [catalogApprovals.revisionId, catalogApprovals.contentHash],
  }).onDelete("restrict").onUpdate("restrict"),
]);

export const catalogWorkflowEvents = pgTable("catalog_workflow_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  revisionId: uuid("revision_id").notNull().references(() => catalogRevisions.id, { onDelete: "restrict", onUpdate: "restrict" }),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("catalog_workflow_events_action", sql`${table.action} IN ('create','save','clone','submit','approve','reject','publish','archive')`),
  check("catalog_workflow_events_actor", sql`length(btrim(${table.actorId})) BETWEEN 1 AND 200`),
]);

// Code-owned page identities. No editor-controlled routes or template switching.
export const pages = pgTable("pages", {
  key: text("key").primaryKey(),
  template: text("template").notNull(),
}, table => [
  check("pages_template_key", sql`(${table.key} IN ('home','about','menu','guides','promos','location') AND ${table.template} = ${table.key}) OR (${table.key} IN ('guide-takoyaki','guide-okonomiyaki','guide-burger') AND ${table.template} = 'guide')`),
]);

export const pageRevisions = pgTable("page_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  pageKey: text("page_key").notNull().references(() => pages.key, { onDelete: "restrict", onUpdate: "restrict" }),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  contentHash: text("content_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("page_revisions_page_hash").on(table.pageKey, table.id, table.contentHash),
  check("page_revisions_status", sql`${table.status} IN ('draft','review','approved','rejected','published','archived')`),
  check("page_revisions_version", sql`${table.version} >= 1`),
  check("page_revisions_hash", sql`(${table.status} = 'draft' AND ${table.contentHash} IS NULL) OR (${table.status} <> 'draft' AND ${table.contentHash} IS NOT NULL AND ${table.contentHash} ~ '^[0-9a-f]{64}$')`),
]);

export const pageTranslations = pgTable("page_translations", {
  revisionId: uuid("revision_id").notNull().references(() => pageRevisions.id, { onDelete: "restrict", onUpdate: "restrict" }),
  locale: text("locale").notNull(),
  fields: jsonb("fields").notNull(),
}, table => [
  primaryKey({ name: "page_translations_pk", columns: [table.revisionId, table.locale] }),
  check("page_translations_locale", sql`${table.locale} IN ('id','en')`),
  check("page_translations_object", sql`jsonb_typeof(${table.fields}) = 'object'`),
  check("page_translations_size", sql`octet_length(${table.fields}::text) <= 131072`),
]);

export const pageSubmissions = pgTable("page_submissions", {
  revisionId: uuid("revision_id").primaryKey().references(() => pageRevisions.id, { onDelete: "restrict", onUpdate: "restrict" }),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
  submittedBy: text("submitted_by").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("page_submissions_revision_hash").on(table.revisionId, table.contentHash),
  check("page_submissions_version", sql`${table.version} >= 1`),
  check("page_submissions_hash", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
  check("page_submissions_actor", sql`length(btrim(${table.submittedBy})) BETWEEN 1 AND 200`),
]);

export const pageApprovals = pgTable("page_approvals", {
  revisionId: uuid("revision_id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  approvedBy: text("approved_by").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("page_approvals_revision_hash").on(table.revisionId, table.contentHash),
  foreignKey({ name: "page_approvals_submission_fk", columns: [table.revisionId, table.contentHash],
    foreignColumns: [pageSubmissions.revisionId, pageSubmissions.contentHash],
  }).onDelete("restrict").onUpdate("restrict"),
  check("page_approvals_actor", sql`length(btrim(${table.approvedBy})) BETWEEN 1 AND 200`),
]);

export const pagePublications = pgTable("page_publications", {
  pageKey: text("page_key").primaryKey().references(() => pages.key, { onDelete: "restrict", onUpdate: "restrict" }),
  revisionId: uuid("revision_id").notNull(),
  contentHash: text("content_hash").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  foreignKey({ name: "page_publications_revision_fk", columns: [table.pageKey, table.revisionId, table.contentHash],
    foreignColumns: [pageRevisions.pageKey, pageRevisions.id, pageRevisions.contentHash],
  }).onDelete("restrict").onUpdate("restrict"),
  foreignKey({ name: "page_publications_approval_fk", columns: [table.revisionId, table.contentHash],
    foreignColumns: [pageApprovals.revisionId, pageApprovals.contentHash],
  }).onDelete("restrict").onUpdate("restrict"),
]);

export const pageWorkflowEvents = pgTable("page_workflow_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  revisionId: uuid("revision_id").notNull().references(() => pageRevisions.id, { onDelete: "restrict", onUpdate: "restrict" }),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("page_workflow_events_action", sql`${table.action} IN ('create','save','clone','submit','approve','reject','publish','archive')`),
  check("page_workflow_events_actor", sql`length(btrim(${table.actorId})) BETWEEN 1 AND 200`),
]);

// Immutable inspected metadata. Physical inspection/storage adapters are wired
// separately; no filename, browser MIME or client-provided size is trusted.
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  storageKey: text("storage_key").unique("media_assets_storage_key_unique"),
  mime: text("mime"),
  byteSize: integer("byte_size"),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  checksum: text("checksum"),
  externalId: text("external_id"),
  posterId: uuid("poster_id").references(() => mediaAssets.id, { onDelete: "restrict", onUpdate: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("media_assets_shape", sql`
    (${table.kind} = 'image' AND ${table.storageKey} IS NOT NULL AND ${table.mime} IS NOT NULL AND
      ${table.mime} IN ('image/jpeg','image/png','image/webp') AND ${table.byteSize} IS NOT NULL AND
      ${table.byteSize} BETWEEN 1 AND 10000000 AND ${table.width} IS NOT NULL AND ${table.height} IS NOT NULL AND
      ${table.width} BETWEEN 1 AND 4096 AND ${table.height} BETWEEN 1 AND 4096 AND
      ${table.durationMs} IS NULL AND ${table.externalId} IS NULL AND ${table.posterId} IS NULL AND ${table.checksum} IS NOT NULL)
    OR
    (${table.kind} = 'video' AND ${table.storageKey} IS NOT NULL AND ${table.mime} IS NOT NULL AND
      ${table.mime} IN ('video/mp4','video/webm') AND ${table.byteSize} IS NOT NULL AND
      ${table.byteSize} BETWEEN 1 AND 100000000 AND ${table.width} IS NOT NULL AND ${table.height} IS NOT NULL AND
      ${table.width} > 0 AND ${table.height} > 0 AND greatest(${table.width},${table.height}) <= 1920 AND
      least(${table.width},${table.height}) <= 1080 AND ${table.durationMs} IS NOT NULL AND
      ${table.durationMs} BETWEEN 1 AND 120000 AND ${table.externalId} IS NULL AND ${table.posterId} IS NOT NULL AND ${table.checksum} IS NOT NULL)
    OR
    (${table.kind} = 'youtube' AND ${table.storageKey} IS NULL AND ${table.mime} IS NULL AND
      ${table.byteSize} IS NULL AND ${table.width} IS NULL AND ${table.height} IS NULL AND ${table.durationMs} IS NULL AND
      ${table.checksum} IS NULL AND ${table.externalId} IS NOT NULL AND ${table.externalId} ~ '^[A-Za-z0-9_-]{11}$' AND ${table.posterId} IS NOT NULL)`),
  check("media_assets_checksum", sql`${table.checksum} IS NULL OR ${table.checksum} ~ '^[0-9a-f]{64}$'`),
  check("media_assets_storage_key", sql`${table.storageKey} IS NULL OR
    (${table.storageKey} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|mp4|webm)$' AND (
      (${table.mime} = 'image/jpeg' AND ${table.storageKey} ~ '[.](jpg|jpeg)$') OR
      (${table.mime} = 'image/png' AND ${table.storageKey} ~ '[.]png$') OR
      (${table.mime} = 'image/webp' AND ${table.storageKey} ~ '[.]webp$') OR
      (${table.mime} = 'video/mp4' AND ${table.storageKey} ~ '[.]mp4$') OR
      (${table.mime} = 'video/webm' AND ${table.storageKey} ~ '[.]webm$')))`),
]);

const mediaReferenceFields = () => ({
  revisionId: uuid("revision_id").notNull(),
  id: uuid("id").defaultRandom().notNull(),
  assetId: uuid("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "restrict", onUpdate: "restrict" }),
  altId: text("alt_id").notNull().default(""),
  altEn: text("alt_en").notNull().default(""),
  captionId: text("caption_id").notNull().default(""),
  captionEn: text("caption_en").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});
const mediaReferenceChecks = (table, prefix) => [
  check(prefix + "_text", sql`length(${table.altId}) <= 500 AND length(${table.altEn}) <= 500 AND length(${table.captionId}) <= 2000 AND length(${table.captionEn}) <= 2000`),
  check(prefix + "_sort", sql`${table.sortOrder} >= 0`),
];
export const catalogMediaRefs = pgTable("catalog_media_refs", {
  ...mediaReferenceFields(),
  productId: uuid("product_id").notNull(),
}, table => [
  primaryKey({ name: "catalog_media_refs_pk", columns: [table.revisionId, table.id] }),
  foreignKey({ name: "catalog_media_refs_product_fk", columns: [table.revisionId, table.productId],
    foreignColumns: [productEntries.revisionId, productEntries.productId],
  }).onDelete("restrict").onUpdate("restrict"),
  ...mediaReferenceChecks(table, "catalog_media_refs"),
]);
export const pageMediaRefs = pgTable("page_media_refs", {
  ...mediaReferenceFields(),
}, table => [
  primaryKey({ name: "page_media_refs_pk", columns: [table.revisionId, table.id] }),
  foreignKey({ name: "page_media_refs_revision_fk", columns: [table.revisionId],
    foreignColumns: [pageRevisions.id],
  }).onDelete("restrict").onUpdate("restrict"),
  ...mediaReferenceChecks(table, "page_media_refs"),
]);
export const mediaEvents = pgTable("media_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "restrict", onUpdate: "restrict" }),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("media_events_action", sql`${table.action} = 'register'`),
  check("media_events_actor", sql`length(btrim(${table.actorId})) BETWEEN 1 AND 200`),
]);
