CREATE TABLE public.publication_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 page_revision_id uuid REFERENCES public.page_revisions(id) ON DELETE RESTRICT,
 catalog_revision_id uuid REFERENCES public.catalog_revisions(id) ON DELETE RESTRICT,
 target text NOT NULL, revision_version integer NOT NULL CHECK(revision_version>0),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), expected_live_revision_id uuid,
 due_at timestamptz NOT NULL, next_attempt_at timestamptz NOT NULL,
 created_by text NOT NULL CHECK(length(created_by) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','succeeded','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 last_code text CHECK(last_code IN ('MANUAL_PUBLICATION','REVISION_UNAVAILABLE','OWNER_UNAVAILABLE','PUBLICATION_CHANGED','PUBLISH_FAILED','CANCELLED','RETRY')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((page_revision_id IS NOT NULL)::integer+(catalog_revision_id IS NOT NULL)::integer=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX publication_jobs_active_target ON public.publication_jobs(target) WHERE status='scheduled';
--> statement-breakpoint
CREATE INDEX publication_jobs_due ON public.publication_jobs(next_attempt_at,id) WHERE status='scheduled';
--> statement-breakpoint
CREATE TABLE public.publication_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.publication_jobs(id) ON DELETE RESTRICT,
 job_version integer NOT NULL CHECK(job_version>0), action text NOT NULL CHECK(action IN ('schedule','cancel','succeeded','retry','failed')),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 200), source text NOT NULL CHECK(source IN ('cms','worker')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(job_id,job_version)
);
--> statement-breakpoint
CREATE FUNCTION public.publishing_guard_job() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root record; live uuid; approved boolean;
BEGIN
 IF TG_OP NOT IN ('INSERT','UPDATE') THEN RAISE EXCEPTION 'Durable publication jobs cannot be removed' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(76210990);
 IF TG_OP='INSERT' THEN
  IF NEW.page_revision_id IS NOT NULL THEN
   SELECT id,status,version,content_hash,'page:'||page_key AS target INTO root FROM public.page_revisions WHERE id=NEW.page_revision_id;
   SELECT EXISTS(SELECT 1 FROM public.page_approvals WHERE revision_id=NEW.page_revision_id AND content_hash=NEW.content_hash) INTO approved;
   SELECT revision_id INTO live FROM public.page_publications WHERE 'page:'||page_key=NEW.target;
  ELSE
   SELECT id,status,version,content_hash,'catalog'::text AS target INTO root FROM public.catalog_revisions WHERE id=NEW.catalog_revision_id;
   SELECT EXISTS(SELECT 1 FROM public.catalog_approvals WHERE revision_id=NEW.catalog_revision_id AND content_hash=NEW.content_hash) INTO approved;
   SELECT revision_id INTO live FROM public.catalog_publication WHERE id=1;
  END IF;
  IF root.id IS NULL OR root.status<>'approved' OR root.version<>NEW.revision_version OR root.content_hash<>NEW.content_hash OR root.target<>NEW.target OR NOT approved
   OR live IS DISTINCT FROM NEW.expected_live_revision_id THEN RAISE EXCEPTION 'Require exact approved publication snapshot' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM cms_auth.roles WHERE user_id=NEW.created_by AND role='owner' AND enabled) THEN RAISE EXCEPTION 'Enabled Owner required' USING ERRCODE='23514'; END IF;
  IF NEW.status<>'scheduled' OR NEW.attempts<>0 OR NEW.version<>1 OR NEW.last_code IS NOT NULL OR NEW.next_attempt_at<>NEW.due_at
   OR NEW.due_at<=clock_timestamp() OR NEW.due_at>clock_timestamp()+interval '365 days' THEN RAISE EXCEPTION 'Invalid initial schedule' USING ERRCODE='23514'; END IF;
 ELSE
  IF (NEW.id,NEW.page_revision_id,NEW.catalog_revision_id,NEW.target,NEW.revision_version,NEW.content_hash,NEW.expected_live_revision_id,NEW.due_at,NEW.created_by,NEW.created_at)
   IS DISTINCT FROM (OLD.id,OLD.page_revision_id,OLD.catalog_revision_id,OLD.target,OLD.revision_version,OLD.content_hash,OLD.expected_live_revision_id,OLD.due_at,OLD.created_by,OLD.created_at)
   OR OLD.status<>'scheduled' OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Frozen schedule identity or stale transition' USING ERRCODE='23514'; END IF;
  IF NEW.status='scheduled' AND (NEW.attempts<>OLD.attempts+1 OR NEW.attempts>=3 OR NEW.next_attempt_at<=clock_timestamp() OR NEW.last_code IS DISTINCT FROM 'RETRY') THEN RAISE EXCEPTION 'Invalid retry' USING ERRCODE='23514'; END IF;
  IF NEW.status IN ('succeeded','failed') AND NEW.attempts<>OLD.attempts+1 THEN RAISE EXCEPTION 'Invalid completion' USING ERRCODE='23514'; END IF;
  IF NEW.status='cancelled' AND NEW.attempts<>OLD.attempts THEN RAISE EXCEPTION 'Invalid cancellation' USING ERRCODE='23514'; END IF;
  IF NEW.status IN ('scheduled','succeeded','failed') AND OLD.next_attempt_at>clock_timestamp() THEN RAISE EXCEPTION 'Job is not due' USING ERRCODE='23514'; END IF;
  IF NEW.status='failed' AND (NEW.last_code IS NULL OR NEW.last_code NOT IN ('REVISION_UNAVAILABLE','OWNER_UNAVAILABLE','PUBLICATION_CHANGED','PUBLISH_FAILED')) THEN RAISE EXCEPTION 'Failure reason required' USING ERRCODE='23514'; END IF;
  IF NEW.status='cancelled' AND (NEW.last_code IS NULL OR NEW.last_code NOT IN ('CANCELLED','MANUAL_PUBLICATION','REVISION_UNAVAILABLE')) THEN RAISE EXCEPTION 'Cancellation reason required' USING ERRCODE='23514'; END IF;
  IF NEW.status='succeeded' THEN
   IF NEW.last_code IS NOT NULL OR NOT EXISTS(SELECT 1 FROM cms_auth.roles WHERE user_id=NEW.created_by AND role='owner' AND enabled) THEN RAISE EXCEPTION 'Successful Owner publication required' USING ERRCODE='23514'; END IF;
   IF NEW.page_revision_id IS NOT NULL THEN
    SELECT revision_id INTO live FROM public.page_publications WHERE 'page:'||page_key=NEW.target AND content_hash=NEW.content_hash;
   ELSE
    SELECT revision_id INTO live FROM public.catalog_publication WHERE id=1 AND content_hash=NEW.content_hash;
   END IF;
   IF live IS DISTINCT FROM coalesce(NEW.page_revision_id,NEW.catalog_revision_id) THEN RAISE EXCEPTION 'Successful exact publication required' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.publishing_guard_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Append-only publication audit' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.publication_jobs WHERE id=NEW.job_id AND version=NEW.job_version
   AND CASE status WHEN 'scheduled' THEN CASE WHEN attempts=0 THEN NEW.action='schedule' AND NEW.source='cms' ELSE NEW.action='retry' AND NEW.source='worker' END
     WHEN 'cancelled' THEN NEW.action='cancel' AND NEW.source='cms'
     ELSE NEW.action=status AND NEW.source='worker' END) THEN RAISE EXCEPTION 'Exact job audit required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER publication_jobs_write BEFORE INSERT OR UPDATE OR DELETE ON public.publication_jobs FOR EACH ROW EXECUTE FUNCTION public.publishing_guard_job();
--> statement-breakpoint
CREATE TRIGGER publication_jobs_truncate BEFORE TRUNCATE ON public.publication_jobs FOR EACH STATEMENT EXECUTE FUNCTION public.publishing_guard_job();
--> statement-breakpoint
CREATE TRIGGER publication_events_write BEFORE INSERT OR UPDATE OR DELETE ON public.publication_events FOR EACH ROW EXECUTE FUNCTION public.publishing_guard_event();
--> statement-breakpoint
CREATE TRIGGER publication_events_truncate BEFORE TRUNCATE ON public.publication_events FOR EACH STATEMENT EXECUTE FUNCTION public.publishing_guard_event();
--> statement-breakpoint
DO $$
DECLARE cms_name text;
BEGIN
 IF current_user='tiny_osaka_test_owner' THEN cms_name:='tiny_osaka_test_cms';
 ELSIF current_user='tiny_osaka_dev_owner' THEN cms_name:='tiny_osaka_dev_cms';
 ELSE RAISE EXCEPTION 'Unexpected publishing migration owner'; END IF;
 EXECUTE format('GRANT SELECT,INSERT ON public.publication_jobs,public.publication_events TO %I',cms_name);
 EXECUTE format('GRANT UPDATE ON public.publication_jobs TO %I',cms_name);
END $$;
