CREATE TABLE "page_approvals" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_approvals_revision_hash" UNIQUE("revision_id","content_hash"),
	CONSTRAINT "page_approvals_actor" CHECK (length(btrim("page_approvals"."approved_by")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "page_publications" (
	"page_key" text PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_revisions_page_hash" UNIQUE("page_key","id","content_hash"),
	CONSTRAINT "page_revisions_status" CHECK ("page_revisions"."status" IN ('draft','review','approved','rejected','published','archived')),
	CONSTRAINT "page_revisions_version" CHECK ("page_revisions"."version" >= 1),
	CONSTRAINT "page_revisions_hash" CHECK (("page_revisions"."status" = 'draft' AND "page_revisions"."content_hash" IS NULL) OR ("page_revisions"."status" <> 'draft' AND "page_revisions"."content_hash" IS NOT NULL AND "page_revisions"."content_hash" ~ '^[0-9a-f]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "page_submissions" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_submissions_revision_hash" UNIQUE("revision_id","content_hash"),
	CONSTRAINT "page_submissions_version" CHECK ("page_submissions"."version" >= 1),
	CONSTRAINT "page_submissions_hash" CHECK ("page_submissions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "page_submissions_actor" CHECK (length(btrim("page_submissions"."submitted_by")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "page_translations" (
	"revision_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"fields" jsonb NOT NULL,
	CONSTRAINT "page_translations_pk" PRIMARY KEY("revision_id","locale"),
	CONSTRAINT "page_translations_locale" CHECK ("page_translations"."locale" IN ('id','en')),
	CONSTRAINT "page_translations_object" CHECK (jsonb_typeof("page_translations"."fields") = 'object'),
	CONSTRAINT "page_translations_size" CHECK (octet_length("page_translations"."fields"::text) <= 131072)
);
--> statement-breakpoint
CREATE TABLE "page_workflow_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_workflow_events_action" CHECK ("page_workflow_events"."action" IN ('submit','approve','reject','publish','archive')),
	CONSTRAINT "page_workflow_events_actor" CHECK (length(btrim("page_workflow_events"."actor_id")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"key" text PRIMARY KEY NOT NULL,
	"template" text NOT NULL,
	CONSTRAINT "pages_template_key" CHECK (("pages"."key" IN ('home','about','menu','guides','promos','location') AND "pages"."template" = "pages"."key") OR ("pages"."key" IN ('guide-takoyaki','guide-okonomiyaki','guide-burger') AND "pages"."template" = 'guide'))
);
--> statement-breakpoint
ALTER TABLE "page_approvals" ADD CONSTRAINT "page_approvals_submission_fk" FOREIGN KEY ("revision_id","content_hash") REFERENCES "public"."page_submissions"("revision_id","content_hash") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_publications" ADD CONSTRAINT "page_publications_page_key_pages_key_fk" FOREIGN KEY ("page_key") REFERENCES "public"."pages"("key") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_publications" ADD CONSTRAINT "page_publications_revision_fk" FOREIGN KEY ("page_key","revision_id","content_hash") REFERENCES "public"."page_revisions"("page_key","id","content_hash") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_publications" ADD CONSTRAINT "page_publications_approval_fk" FOREIGN KEY ("revision_id","content_hash") REFERENCES "public"."page_approvals"("revision_id","content_hash") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_key_pages_key_fk" FOREIGN KEY ("page_key") REFERENCES "public"."pages"("key") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_submissions" ADD CONSTRAINT "page_submissions_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_workflow_events" ADD CONSTRAINT "page_workflow_events_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
-- Custom invoker-only guards; trusted server RBAC is separate. No runtime grants.
CREATE FUNCTION public.page_guard_root() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.content_hash IS NOT NULL THEN
      RAISE EXCEPTION 'New page revisions must be drafts' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Frozen page revision' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.page_key IS DISTINCT FROM OLD.page_key THEN
    RAISE EXCEPTION 'Immutable page identity' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN RETURN NEW; END IF;
  IF OLD.status <> 'draft' AND
    (NEW.version IS DISTINCT FROM OLD.version OR NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
    RAISE EXCEPTION 'Frozen page content' USING ERRCODE = '23514';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version OR NOT (
    (OLD.status = 'draft' AND NEW.status = 'review') OR
    (OLD.status = 'review' AND NEW.status IN ('approved','rejected')) OR
    (OLD.status = 'approved' AND NEW.status IN ('published','archived')) OR
    (OLD.status IN ('published','rejected') AND NEW.status = 'archived')
  ) THEN RAISE EXCEPTION 'Invalid page transition' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.page_submissions s
    WHERE s.revision_id = NEW.id AND s.version = NEW.version AND s.content_hash = NEW.content_hash) THEN
    RAISE EXCEPTION 'Exact page submission required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('approved','published') AND NOT EXISTS
    (SELECT 1 FROM public.page_approvals a WHERE a.revision_id = NEW.id AND a.content_hash = NEW.content_hash) THEN
    RAISE EXCEPTION 'Exact page approval required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'archived' THEN
    PERFORM pg_advisory_xact_lock(76210985,hashtext(NEW.page_key));
    IF EXISTS (SELECT 1 FROM public.page_publications p WHERE p.revision_id = NEW.id) THEN
      RAISE EXCEPTION 'Cannot archive live page' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.page_guard_translation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE target uuid; state text;
BEGIN
  FOR target IN SELECT DISTINCT id FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.revision_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.revision_id END
  ]) AS ids(id) WHERE id IS NOT NULL ORDER BY id LOOP
    SELECT status INTO state FROM public.page_revisions WHERE id = target FOR SHARE;
    IF state IS NOT NULL AND state <> 'draft' THEN
      RAISE EXCEPTION 'Page translation requires draft' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.page_guard_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Code-owned page identity is immutable' USING ERRCODE = '23514'; END $$;
--> statement-breakpoint
CREATE FUNCTION public.page_guard_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root public.page_revisions;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Append-only page receipt' USING ERRCODE = '23514'; END IF;
  SELECT * INTO root FROM public.page_revisions WHERE id = NEW.revision_id FOR SHARE;
  IF TG_TABLE_NAME = 'page_submissions' THEN
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
CREATE FUNCTION public.page_check_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root public.page_revisions;
BEGIN
  SELECT * INTO root FROM public.page_revisions WHERE id = NEW.revision_id;
  IF root.status IS NULL OR root.status = 'draft' OR root.content_hash IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'Incomplete page transition' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'page_submissions' THEN
    IF root.version IS DISTINCT FROM NEW.version THEN
      RAISE EXCEPTION 'Page submission version differs' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF root.status NOT IN ('approved','published','archived') THEN
      RAISE EXCEPTION 'Incomplete page approval' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.page_guard_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root public.page_revisions;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Page pointer cannot be deleted' USING ERRCODE = '23514'; END IF;
  PERFORM pg_advisory_xact_lock(76210985,hashtext(NEW.page_key));
  IF TG_OP = 'UPDATE' AND NEW.page_key IS DISTINCT FROM OLD.page_key THEN
    RAISE EXCEPTION 'Page pointer identity is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO root FROM public.page_revisions WHERE id = NEW.revision_id FOR SHARE;
  IF root.page_key IS DISTINCT FROM NEW.page_key OR root.status IS DISTINCT FROM 'published' OR root.content_hash IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'Live page requires exact published revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.page_guard_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Append-only page audit' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.page_deny_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Page truncate prohibited' USING ERRCODE = '23514'; END $$;
--> statement-breakpoint
CREATE TRIGGER page_root_guard BEFORE INSERT OR UPDATE OR DELETE ON public.page_revisions FOR EACH ROW EXECUTE FUNCTION public.page_guard_root();
--> statement-breakpoint
CREATE TRIGGER page_translation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.page_translations FOR EACH ROW EXECUTE FUNCTION public.page_guard_translation();
--> statement-breakpoint
CREATE TRIGGER page_identity_guard BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.page_guard_identity();
--> statement-breakpoint
CREATE TRIGGER page_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON public.page_submissions FOR EACH ROW EXECUTE FUNCTION public.page_guard_receipt();
--> statement-breakpoint
CREATE TRIGGER page_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON public.page_approvals FOR EACH ROW EXECUTE FUNCTION public.page_guard_receipt();
--> statement-breakpoint
CREATE TRIGGER page_publication_guard BEFORE INSERT OR UPDATE OR DELETE ON public.page_publications FOR EACH ROW EXECUTE FUNCTION public.page_guard_publication();
--> statement-breakpoint
CREATE TRIGGER page_event_guard BEFORE INSERT OR UPDATE OR DELETE ON public.page_workflow_events FOR EACH ROW EXECUTE FUNCTION public.page_guard_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER page_receipt_complete AFTER INSERT ON public.page_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.page_check_receipt();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER page_receipt_complete AFTER INSERT ON public.page_approvals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.page_check_receipt();
--> statement-breakpoint
CREATE TRIGGER page_no_truncate BEFORE TRUNCATE ON public.pages FOR EACH STATEMENT EXECUTE FUNCTION public.page_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER page_no_truncate BEFORE TRUNCATE ON public.page_revisions FOR EACH STATEMENT EXECUTE FUNCTION public.page_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER page_no_truncate BEFORE TRUNCATE ON public.page_translations FOR EACH STATEMENT EXECUTE FUNCTION public.page_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER page_no_truncate BEFORE TRUNCATE ON public.page_submissions FOR EACH STATEMENT EXECUTE FUNCTION public.page_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER page_no_truncate BEFORE TRUNCATE ON public.page_approvals FOR EACH STATEMENT EXECUTE FUNCTION public.page_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER page_no_truncate BEFORE TRUNCATE ON public.page_publications FOR EACH STATEMENT EXECUTE FUNCTION public.page_deny_truncate();
--> statement-breakpoint
CREATE TRIGGER page_no_truncate BEFORE TRUNCATE ON public.page_workflow_events FOR EACH STATEMENT EXECUTE FUNCTION public.page_deny_truncate();
