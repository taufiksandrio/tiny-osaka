CREATE TABLE "catalog_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_revisions_draft_only" CHECK ("catalog_revisions"."status" = 'draft'),
	CONSTRAINT "catalog_revisions_version_positive" CHECK ("catalog_revisions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categories_slug_format" CHECK ("categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "category_entries" (
	"revision_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "category_entries_pk" PRIMARY KEY("revision_id","category_id"),
	CONSTRAINT "category_entries_sort_nonnegative" CHECK ("category_entries"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "category_translations" (
	"revision_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "category_translations_pk" PRIMARY KEY("revision_id","category_id","locale"),
	CONSTRAINT "category_translations_locale" CHECK ("category_translations"."locale" IN ('id', 'en')),
	CONSTRAINT "category_translations_title_nonempty" CHECK (length(btrim("category_translations"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_entries" (
	"revision_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_entries_pk" PRIMARY KEY("revision_id","product_id"),
	CONSTRAINT "product_entries_sort_nonnegative" CHECK ("product_entries"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_translations" (
	"revision_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "product_translations_pk" PRIMARY KEY("revision_id","product_id","locale"),
	CONSTRAINT "product_translations_locale" CHECK ("product_translations"."locale" IN ('id', 'en')),
	CONSTRAINT "product_translations_title_nonempty" CHECK (length(btrim("product_translations"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "category_entries" ADD CONSTRAINT "category_entries_revision_id_catalog_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."catalog_revisions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "category_entries" ADD CONSTRAINT "category_entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_entry_fk" FOREIGN KEY ("revision_id","category_id") REFERENCES "public"."category_entries"("revision_id","category_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "product_entries" ADD CONSTRAINT "product_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "product_entries" ADD CONSTRAINT "product_entries_category_in_revision_fk" FOREIGN KEY ("revision_id","category_id") REFERENCES "public"."category_entries"("revision_id","category_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_entry_fk" FOREIGN KEY ("revision_id","product_id") REFERENCES "public"."product_entries"("revision_id","product_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "product_entries_category_idx" ON "product_entries" USING btree ("revision_id","category_id");