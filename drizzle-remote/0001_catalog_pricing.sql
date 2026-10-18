CREATE TABLE "modifier_group_translations" (
	"revision_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "modifier_group_translations_pk" PRIMARY KEY("revision_id","product_id","group_id","locale"),
	CONSTRAINT "modifier_group_translations_locale" CHECK ("modifier_group_translations"."locale" IN ('id', 'en')),
	CONSTRAINT "modifier_group_translations_title_nonempty" CHECK (length(btrim("modifier_group_translations"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"revision_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"selection_type" text NOT NULL,
	"min_selections" integer NOT NULL,
	"max_selections" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "modifier_groups_pk" PRIMARY KEY("revision_id","product_id","id"),
	CONSTRAINT "modifier_groups_code_unique" UNIQUE("revision_id","product_id","code"),
	CONSTRAINT "modifier_groups_code_format" CHECK ("modifier_groups"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "modifier_groups_selection_type" CHECK ("modifier_groups"."selection_type" IN ('single', 'multiple')),
	CONSTRAINT "modifier_groups_selection_range" CHECK ("modifier_groups"."min_selections" >= 0 AND "modifier_groups"."max_selections" >= "modifier_groups"."min_selections"),
	CONSTRAINT "modifier_groups_single_limit" CHECK ("modifier_groups"."selection_type" <> 'single' OR "modifier_groups"."max_selections" <= 1),
	CONSTRAINT "modifier_groups_sort_nonnegative" CHECK ("modifier_groups"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "modifier_option_translations" (
	"revision_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "modifier_option_translations_pk" PRIMARY KEY("revision_id","product_id","group_id","option_id","locale"),
	CONSTRAINT "modifier_option_translations_locale" CHECK ("modifier_option_translations"."locale" IN ('id', 'en')),
	CONSTRAINT "modifier_option_translations_title_nonempty" CHECK (length(btrim("modifier_option_translations"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"revision_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"price_delta" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "modifier_options_pk" PRIMARY KEY("revision_id","product_id","group_id","id"),
	CONSTRAINT "modifier_options_id_unique" UNIQUE("revision_id","product_id","id"),
	CONSTRAINT "modifier_options_code_unique" UNIQUE("revision_id","product_id","group_id","code"),
	CONSTRAINT "modifier_options_code_format" CHECK ("modifier_options"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "modifier_options_price_safe" CHECK ("modifier_options"."price_delta" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "modifier_options_sort_nonnegative" CHECK ("modifier_options"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"revision_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"base_price" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_variants_pk" PRIMARY KEY("revision_id","product_id","id"),
	CONSTRAINT "product_variants_code_unique" UNIQUE("revision_id","product_id","code"),
	CONSTRAINT "product_variants_code_format" CHECK ("product_variants"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "product_variants_price_safe" CHECK ("product_variants"."base_price" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "product_variants_sort_nonnegative" CHECK ("product_variants"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "variant_translations" (
	"revision_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "variant_translations_pk" PRIMARY KEY("revision_id","product_id","variant_id","locale"),
	CONSTRAINT "variant_translations_locale" CHECK ("variant_translations"."locale" IN ('id', 'en')),
	CONSTRAINT "variant_translations_title_nonempty" CHECK (length(btrim("variant_translations"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "modifier_group_translations" ADD CONSTRAINT "modifier_group_translations_group_fk" FOREIGN KEY ("revision_id","product_id","group_id") REFERENCES "public"."modifier_groups"("revision_id","product_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_entry_fk" FOREIGN KEY ("revision_id","product_id") REFERENCES "public"."product_entries"("revision_id","product_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "modifier_option_translations" ADD CONSTRAINT "modifier_option_translations_option_fk" FOREIGN KEY ("revision_id","product_id","group_id","option_id") REFERENCES "public"."modifier_options"("revision_id","product_id","group_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_fk" FOREIGN KEY ("revision_id","product_id","group_id") REFERENCES "public"."modifier_groups"("revision_id","product_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_entry_fk" FOREIGN KEY ("revision_id","product_id") REFERENCES "public"."product_entries"("revision_id","product_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "variant_translations" ADD CONSTRAINT "variant_translations_variant_fk" FOREIGN KEY ("revision_id","product_id","variant_id") REFERENCES "public"."product_variants"("revision_id","product_id","id") ON DELETE restrict ON UPDATE restrict;