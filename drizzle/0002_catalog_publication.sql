CREATE TABLE "catalog_approvals" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_approvals_revision_hash" UNIQUE("revision_id","content_hash"),
	CONSTRAINT "catalog_approvals_actor" CHECK (length(btrim("catalog_approvals"."approved_by")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "catalog_publication" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_publication_singleton" CHECK ("catalog_publication"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "catalog_submissions" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_submissions_revision_hash" UNIQUE("revision_id","content_hash"),
	CONSTRAINT "catalog_submissions_version" CHECK ("catalog_submissions"."version" >= 1),
	CONSTRAINT "catalog_submissions_hash" CHECK ("catalog_submissions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "catalog_submissions_actor" CHECK (length(btrim("catalog_submissions"."submitted_by")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "catalog_workflow_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_workflow_events_action" CHECK ("catalog_workflow_events"."action" IN ('submit','approve','reject','publish','archive')),
	CONSTRAINT "catalog_workflow_events_actor" CHECK (length(btrim("catalog_workflow_events"."actor_id")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "catalog_revisions" DROP CONSTRAINT "catalog_revisions_draft_only";--> statement-breakpoint
ALTER TABLE "catalog_revisions" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "catalog_approvals" ADD CONSTRAINT "catalog_approvals_submission_fk" FOREIGN KEY ("revision_id","content_hash") REFERENCES "public"."catalog_submissions"("revision_id","content_hash") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "catalog_publication" ADD CONSTRAINT "catalog_publication_approval_fk" FOREIGN KEY ("revision_id","content_hash") REFERENCES "public"."catalog_approvals"("revision_id","content_hash") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "catalog_submissions" ADD CONSTRAINT "catalog_submissions_revision_id_catalog_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."catalog_revisions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "catalog_workflow_events" ADD CONSTRAINT "catalog_workflow_events_revision_id_catalog_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."catalog_revisions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "catalog_revisions" ADD CONSTRAINT "catalog_revisions_status" CHECK ("catalog_revisions"."status" IN ('draft','review','approved','rejected','published','archived'));--> statement-breakpoint
ALTER TABLE "catalog_revisions" ADD CONSTRAINT "catalog_revisions_hash" CHECK (("catalog_revisions"."status" = 'draft' AND "catalog_revisions"."content_hash" IS NULL) OR ("catalog_revisions"."status" <> 'draft' AND "catalog_revisions"."content_hash" IS NOT NULL AND "catalog_revisions"."content_hash" ~ '^[0-9a-f]{64}$'));

--> statement-breakpoint
-- Hand-reviewed protection layer. RBAC belongs to the trusted server resolver;
-- database owners remain administrators. No runtime grants or bypass flags.
CREATE FUNCTION public.catalog_guard_root() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.content_hash IS NOT NULL THEN
      RAISE EXCEPTION 'New catalog revisions must be drafts' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Frozen catalog revision' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable catalog identity' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN RETURN NEW; END IF;
  IF OLD.status <> 'draft' AND
    (NEW.version IS DISTINCT FROM OLD.version OR NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
    RAISE EXCEPTION 'Frozen catalog content' USING ERRCODE = '23514';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version OR NOT (
    (OLD.status = 'draft' AND NEW.status = 'review') OR
    (OLD.status = 'review' AND NEW.status IN ('approved','rejected')) OR
    (OLD.status = 'approved' AND NEW.status IN ('published','archived')) OR
    (OLD.status IN ('published','rejected') AND NEW.status = 'archived')
  ) THEN RAISE EXCEPTION 'Invalid catalog transition' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_submissions s
    WHERE s.revision_id = NEW.id AND s.version = NEW.version AND s.content_hash = NEW.content_hash) THEN
    RAISE EXCEPTION 'Exact catalog submission required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('approved','published') AND NOT EXISTS
    (SELECT 1 FROM public.catalog_approvals a WHERE a.revision_id = NEW.id AND a.content_hash = NEW.content_hash) THEN
    RAISE EXCEPTION 'Exact catalog approval required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'archived' THEN
    PERFORM pg_advisory_xact_lock(76210984);
    IF EXISTS (SELECT 1 FROM public.catalog_publication p WHERE p.revision_id = NEW.id) THEN
      RAISE EXCEPTION 'Cannot archive live catalog' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_root_guard BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_revisions
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_root();
--> statement-breakpoint
CREATE FUNCTION public.catalog_guard_child() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE target uuid; state text;
BEGIN
  -- Lock old and new roots in stable order. Locks last through commit, so
  -- submission cannot race an INSERT/UPDATE/DELETE, even from raw SQL.
  FOR target IN SELECT DISTINCT id FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.revision_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.revision_id END
  ]) AS ids(id) WHERE id IS NOT NULL ORDER BY id LOOP
    SELECT status INTO state FROM public.catalog_revisions WHERE id = target FOR SHARE;
    IF state IS NOT NULL AND state <> 'draft' THEN
      RAISE EXCEPTION 'Catalog child requires writable draft' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['category_entries','category_translations','product_entries','product_translations',
    'product_variants','variant_translations','modifier_groups','modifier_group_translations',
    'modifier_options','modifier_option_translations'] LOOP
    EXECUTE format('CREATE TRIGGER catalog_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_child()', tab);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.catalog_guard_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root record;
BEGIN
  IF TG_TABLE_NAME = 'categories' THEN
    FOR root IN SELECT r.status FROM public.catalog_revisions r JOIN public.category_entries e ON e.revision_id = r.id
      WHERE e.category_id = OLD.id ORDER BY r.id FOR SHARE OF r LOOP
      IF root.status <> 'draft' THEN RAISE EXCEPTION 'Frozen catalog category identity' USING ERRCODE = '23514'; END IF;
    END LOOP;
  ELSE
    FOR root IN SELECT r.status FROM public.catalog_revisions r JOIN public.product_entries e ON e.revision_id = r.id
      WHERE e.product_id = OLD.id ORDER BY r.id FOR SHARE OF r LOOP
      IF root.status <> 'draft' THEN RAISE EXCEPTION 'Frozen catalog product identity' USING ERRCODE = '23514'; END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_identity_guard BEFORE UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_identity();
--> statement-breakpoint
CREATE TRIGGER catalog_identity_guard BEFORE UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_identity();
--> statement-breakpoint
CREATE FUNCTION public.catalog_guard_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root public.catalog_revisions;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Append-only catalog receipt' USING ERRCODE = '23514'; END IF;
  SELECT * INTO root FROM public.catalog_revisions WHERE id = NEW.revision_id FOR SHARE;
  IF TG_TABLE_NAME = 'catalog_submissions' THEN
    IF root.status IS DISTINCT FROM 'draft' OR root.version IS DISTINCT FROM NEW.version THEN
      RAISE EXCEPTION 'Submission requires exact draft' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF root.status IS DISTINCT FROM 'review' OR root.content_hash IS DISTINCT FROM NEW.content_hash THEN
      RAISE EXCEPTION 'Approval requires exact review' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_submissions
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_receipt();
--> statement-breakpoint
CREATE TRIGGER catalog_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_approvals
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_receipt();
--> statement-breakpoint
CREATE FUNCTION public.catalog_check_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root public.catalog_revisions;
BEGIN
  SELECT * INTO root FROM public.catalog_revisions WHERE id = NEW.revision_id;
  IF root.status IS NULL OR root.status = 'draft' OR root.content_hash IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'Incomplete catalog transition' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'catalog_submissions' AND root.version IS DISTINCT FROM NEW.version THEN
    RAISE EXCEPTION 'Catalog submission version differs' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'catalog_approvals' AND root.status NOT IN ('approved','published','archived') THEN
    RAISE EXCEPTION 'Incomplete catalog approval' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_receipt_complete AFTER INSERT ON public.catalog_submissions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.catalog_check_receipt();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_receipt_complete AFTER INSERT ON public.catalog_approvals
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.catalog_check_receipt();
--> statement-breakpoint
CREATE FUNCTION public.catalog_guard_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root public.catalog_revisions;
BEGIN
  PERFORM pg_advisory_xact_lock(76210984);
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Live catalog pointer cannot be deleted' USING ERRCODE = '23514'; END IF;
  SELECT * INTO root FROM public.catalog_revisions WHERE id = NEW.revision_id FOR SHARE;
  IF root.status IS DISTINCT FROM 'published' OR root.content_hash IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'Live catalog requires exact published revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_publication_guard BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_publication
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_publication();
--> statement-breakpoint
CREATE FUNCTION public.catalog_guard_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Append-only catalog audit' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_event_guard BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_workflow_events
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_event();
--> statement-breakpoint
CREATE FUNCTION public.catalog_deny_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Catalog truncate prohibited' USING ERRCODE = '23514'; END $$;
--> statement-breakpoint
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['catalog_revisions','categories','products','category_entries','category_translations',
    'product_entries','product_translations','product_variants','variant_translations','modifier_groups',
    'modifier_group_translations','modifier_options','modifier_option_translations','catalog_submissions',
    'catalog_approvals','catalog_publication','catalog_workflow_events'] LOOP
    EXECUTE format('CREATE TRIGGER catalog_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.catalog_deny_truncate()', tab);
  END LOOP;
END $$;

