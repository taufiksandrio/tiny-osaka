CREATE TABLE "catalog_media_refs" (
	"revision_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"alt_id" text DEFAULT '' NOT NULL,
	"alt_en" text DEFAULT '' NOT NULL,
	"caption_id" text DEFAULT '' NOT NULL,
	"caption_en" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "catalog_media_refs_pk" PRIMARY KEY("revision_id","id"),
	CONSTRAINT "catalog_media_refs_text" CHECK (length("catalog_media_refs"."alt_id") <= 500 AND length("catalog_media_refs"."alt_en") <= 500 AND length("catalog_media_refs"."caption_id") <= 2000 AND length("catalog_media_refs"."caption_en") <= 2000),
	CONSTRAINT "catalog_media_refs_sort" CHECK ("catalog_media_refs"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text,
	"mime" text,
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"checksum" text,
	"external_id" text,
	"poster_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_assets_shape" CHECK (
    ("media_assets"."kind" = 'image' AND "media_assets"."storage_key" IS NOT NULL AND "media_assets"."mime" IS NOT NULL AND
      "media_assets"."mime" IN ('image/jpeg','image/png','image/webp') AND "media_assets"."byte_size" IS NOT NULL AND
      "media_assets"."byte_size" BETWEEN 1 AND 10000000 AND "media_assets"."width" IS NOT NULL AND "media_assets"."height" IS NOT NULL AND
      "media_assets"."width" BETWEEN 1 AND 4096 AND "media_assets"."height" BETWEEN 1 AND 4096 AND
      "media_assets"."duration_ms" IS NULL AND "media_assets"."external_id" IS NULL AND "media_assets"."poster_id" IS NULL AND "media_assets"."checksum" IS NOT NULL)
    OR
    ("media_assets"."kind" = 'video' AND "media_assets"."storage_key" IS NOT NULL AND "media_assets"."mime" IS NOT NULL AND
      "media_assets"."mime" IN ('video/mp4','video/webm') AND "media_assets"."byte_size" IS NOT NULL AND
      "media_assets"."byte_size" BETWEEN 1 AND 100000000 AND "media_assets"."width" IS NOT NULL AND "media_assets"."height" IS NOT NULL AND
      "media_assets"."width" > 0 AND "media_assets"."height" > 0 AND greatest("media_assets"."width","media_assets"."height") <= 1920 AND
      least("media_assets"."width","media_assets"."height") <= 1080 AND "media_assets"."duration_ms" IS NOT NULL AND
      "media_assets"."duration_ms" BETWEEN 1 AND 120000 AND "media_assets"."external_id" IS NULL AND "media_assets"."poster_id" IS NOT NULL AND "media_assets"."checksum" IS NOT NULL)
    OR
    ("media_assets"."kind" = 'youtube' AND "media_assets"."storage_key" IS NULL AND "media_assets"."mime" IS NULL AND
      "media_assets"."byte_size" IS NULL AND "media_assets"."width" IS NULL AND "media_assets"."height" IS NULL AND "media_assets"."duration_ms" IS NULL AND
      "media_assets"."checksum" IS NULL AND "media_assets"."external_id" IS NOT NULL AND "media_assets"."external_id" ~ '^[A-Za-z0-9_-]{11}$' AND "media_assets"."poster_id" IS NOT NULL)),
	CONSTRAINT "media_assets_checksum" CHECK ("media_assets"."checksum" IS NULL OR "media_assets"."checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "media_assets_storage_key" CHECK ("media_assets"."storage_key" IS NULL OR
    ("media_assets"."storage_key" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|mp4|webm)$' AND (
      ("media_assets"."mime" = 'image/jpeg' AND "media_assets"."storage_key" ~ '[.](jpg|jpeg)$') OR
      ("media_assets"."mime" = 'image/png' AND "media_assets"."storage_key" ~ '[.]png$') OR
      ("media_assets"."mime" = 'image/webp' AND "media_assets"."storage_key" ~ '[.]webp$') OR
      ("media_assets"."mime" = 'video/mp4' AND "media_assets"."storage_key" ~ '[.]mp4$') OR
      ("media_assets"."mime" = 'video/webm' AND "media_assets"."storage_key" ~ '[.]webm$'))))
);
--> statement-breakpoint
CREATE TABLE "media_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_events_action" CHECK ("media_events"."action" = 'register'),
	CONSTRAINT "media_events_actor" CHECK (length(btrim("media_events"."actor_id")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "page_media_refs" (
	"revision_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"alt_id" text DEFAULT '' NOT NULL,
	"alt_en" text DEFAULT '' NOT NULL,
	"caption_id" text DEFAULT '' NOT NULL,
	"caption_en" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_media_refs_pk" PRIMARY KEY("revision_id","id"),
	CONSTRAINT "page_media_refs_text" CHECK (length("page_media_refs"."alt_id") <= 500 AND length("page_media_refs"."alt_en") <= 500 AND length("page_media_refs"."caption_id") <= 2000 AND length("page_media_refs"."caption_en") <= 2000),
	CONSTRAINT "page_media_refs_sort" CHECK ("page_media_refs"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_media_refs" ADD CONSTRAINT "catalog_media_refs_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "catalog_media_refs" ADD CONSTRAINT "catalog_media_refs_product_fk" FOREIGN KEY ("revision_id","product_id") REFERENCES "public"."product_entries"("revision_id","product_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_poster_id_media_assets_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_media_refs" ADD CONSTRAINT "page_media_refs_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_media_refs" ADD CONSTRAINT "page_media_refs_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
-- Metadata is immutable even when unreferenced. Physical storage must use
-- write-once keys and verified bytes; owners remain administrative principals.
CREATE FUNCTION public.media_guard_asset() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE poster_kind text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Immutable media metadata' USING ERRCODE = '23514';
  END IF;
  IF NEW.poster_id IS NOT NULL THEN
    SELECT kind INTO poster_kind FROM public.media_assets WHERE id=NEW.poster_id FOR SHARE;
    IF poster_kind IS DISTINCT FROM 'image' THEN
      RAISE EXCEPTION 'Registered image poster required' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.media_guard_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE target uuid; state text; total integer;
BEGIN
  FOR target IN SELECT DISTINCT id FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.revision_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.revision_id END
  ]) AS ids(id) WHERE id IS NOT NULL ORDER BY id LOOP
    IF TG_TABLE_NAME = 'catalog_media_refs' THEN
      SELECT status INTO state FROM public.catalog_revisions WHERE id=target FOR UPDATE;
    ELSE
      SELECT status INTO state FROM public.page_revisions WHERE id=target FOR UPDATE;
    END IF;
    IF state IS NOT NULL AND state <> 'draft' THEN
      RAISE EXCEPTION 'Media reference requires writable draft' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.revision_id IS DISTINCT FROM OLD.revision_id OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Media reference identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'catalog_media_refs' THEN
      IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
        RAISE EXCEPTION 'Media reference product is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'catalog_media_refs' THEN
      SELECT count(*) INTO total FROM public.catalog_media_refs WHERE revision_id=NEW.revision_id AND product_id=NEW.product_id;
    ELSE
      SELECT count(*) INTO total FROM public.page_media_refs WHERE revision_id=NEW.revision_id;
    END IF;
    IF total >= 12 THEN RAISE EXCEPTION 'Media reference limit' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.media_guard_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Append-only media audit' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER media_asset_guard BEFORE INSERT OR UPDATE OR DELETE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.media_guard_asset();
--> statement-breakpoint
CREATE TRIGGER media_reference_guard BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_media_refs FOR EACH ROW EXECUTE FUNCTION public.media_guard_reference();
--> statement-breakpoint
CREATE TRIGGER media_reference_guard BEFORE INSERT OR UPDATE OR DELETE ON public.page_media_refs FOR EACH ROW EXECUTE FUNCTION public.media_guard_reference();
--> statement-breakpoint
CREATE TRIGGER media_event_guard BEFORE INSERT OR UPDATE OR DELETE ON public.media_events FOR EACH ROW EXECUTE FUNCTION public.media_guard_event();
--> statement-breakpoint
CREATE TRIGGER media_no_truncate BEFORE TRUNCATE ON public.media_assets FOR EACH STATEMENT EXECUTE FUNCTION public.catalog_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER media_no_truncate BEFORE TRUNCATE ON public.media_events FOR EACH STATEMENT EXECUTE FUNCTION public.catalog_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER media_no_truncate BEFORE TRUNCATE ON public.catalog_media_refs FOR EACH STATEMENT EXECUTE FUNCTION public.catalog_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER media_no_truncate BEFORE TRUNCATE ON public.page_media_refs FOR EACH STATEMENT EXECUTE FUNCTION public.catalog_deny_truncate();
