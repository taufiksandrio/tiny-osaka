ALTER TABLE public.page_workflow_events DROP CONSTRAINT page_workflow_events_action;
ALTER TABLE public.page_workflow_events ADD CONSTRAINT page_workflow_events_action CHECK (action IN ('create','save','clone','submit','approve','reject','publish','archive'));
--> statement-breakpoint
DO $$
DECLARE cms_name text;
BEGIN
  IF current_user='tiny_osaka_test_owner' THEN cms_name := 'tiny_osaka_test_cms';
  ELSIF current_user='tiny_osaka_dev_owner' THEN cms_name := 'tiny_osaka_dev_cms';
  ELSE RAISE EXCEPTION 'Unexpected CMS migration owner'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=cms_name AND rolcanlogin AND NOT rolsuper
    AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=cms_name) THEN
    RAISE EXCEPTION 'Provision isolated CMS role first';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public,cms_auth TO %I',cms_name);
  EXECUTE format('GRANT SELECT ON public.pages,public.page_revisions,public.page_translations,public.page_submissions,public.page_approvals,public.page_publications,public.page_workflow_events,public.page_media_refs,public.media_assets TO %I',cms_name);
  EXECUTE format('GRANT INSERT ON public.pages,public.page_revisions,public.page_translations,public.page_submissions,public.page_approvals,public.page_publications,public.page_workflow_events,public.page_media_refs TO %I',cms_name);
  EXECUTE format('GRANT UPDATE ON public.page_revisions,public.page_translations,public.page_publications TO %I',cms_name);
  EXECUTE format('GRANT SELECT (user_id,role,enabled) ON cms_auth.roles TO %I',cms_name);
END;
$$;
