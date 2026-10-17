-- ADR-037 (catalog card CRUD, hard delete A1). Hand-reviewed; NOT applied by agents.
-- Local/isolated databases only until a separate production approval exists.
ALTER TABLE public.catalog_workflow_events DROP CONSTRAINT catalog_workflow_events_action;
--> statement-breakpoint
ALTER TABLE public.catalog_workflow_events ADD CONSTRAINT catalog_workflow_events_action CHECK (action IN ('create','save','clone','submit','approve','reject','publish','archive','delete'));
--> statement-breakpoint
-- The only durable trace of a hard delete. No FK to revisions: they are purged.
CREATE TABLE public.catalog_deletion_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deleted_at timestamp with time zone NOT NULL DEFAULT now(),
 actor_id text NOT NULL,
 product_slug text NOT NULL,
 product_name text NOT NULL,
 CONSTRAINT catalog_deletion_log_actor CHECK (length(btrim(actor_id)) BETWEEN 1 AND 200),
 CONSTRAINT catalog_deletion_log_slug CHECK (product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 CONSTRAINT catalog_deletion_log_name CHECK (length(product_name) BETWEEN 1 AND 240)
);
--> statement-breakpoint
CREATE FUNCTION public.catalog_guard_deletion_log() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Append-only catalog deletion log' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_deletion_log_guard BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_deletion_log
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_deletion_log();
--> statement-breakpoint
CREATE TRIGGER catalog_no_truncate BEFORE TRUNCATE ON public.catalog_deletion_log
FOR EACH STATEMENT EXECUTE FUNCTION public.catalog_deny_truncate();
--> statement-breakpoint
-- Permanent product removal. The caller (one CMS transaction holding the publication
-- locks) has ALREADY published a replacement live snapshot without the product. This
-- function then removes every other snapshot and the product identity. Guards are relaxed
-- only inside this function (DISABLE TRIGGER USER; rolled back on any failure). Internal
-- FK triggers stay enabled, so deletion order must be correct. Revisions that
-- publication_jobs still references keep an empty root shell (job rows are never touched).
-- media_assets is never touched. EXECUTE is restricted to the CMS role below.
CREATE FUNCTION public.catalog_purge_product(p_product_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  live_id uuid; v_slug text; v_name text; gone uuid[]; shells uuid[]; doomed uuid[]; tab text;
BEGIN
  IF p_product_id IS NULL OR p_actor IS NULL OR length(btrim(p_actor)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid catalog purge input' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cms_auth.roles WHERE user_id = p_actor AND role = 'owner' AND enabled) THEN
    RAISE EXCEPTION 'Enabled Owner required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(76210990);
  PERFORM pg_advisory_xact_lock(76210984);
  SELECT revision_id INTO live_id FROM public.catalog_publication WHERE id = 1;
  IF live_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.catalog_revisions WHERE id = live_id AND status = 'published') THEN
    RAISE EXCEPTION 'Published replacement catalog required' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.product_entries WHERE revision_id = live_id AND product_id = p_product_id) THEN
    RAISE EXCEPTION 'Live catalog still contains the product' USING ERRCODE = '23514';
  END IF;
  SELECT p.slug INTO v_slug FROM public.products p WHERE p.id = p_product_id;
  IF v_slug IS NULL THEN RAISE EXCEPTION 'Unknown product' USING ERRCODE = '23514'; END IF;
  SELECT t.title INTO v_name FROM public.product_translations t
    JOIN public.catalog_revisions r ON r.id = t.revision_id
    WHERE t.product_id = p_product_id AND t.locale = 'id' ORDER BY r.created_at DESC LIMIT 1;
  v_name := left(coalesce(nullif(btrim(v_name), ''), v_slug), 240);
  SELECT coalesce(array_agg(r.id), '{}') INTO gone FROM public.catalog_revisions r
    WHERE r.id <> live_id AND NOT EXISTS (SELECT 1 FROM public.publication_jobs j WHERE j.catalog_revision_id = r.id);
  SELECT coalesce(array_agg(r.id), '{}') INTO shells FROM public.catalog_revisions r
    WHERE r.id <> live_id AND EXISTS (SELECT 1 FROM public.publication_jobs j WHERE j.catalog_revision_id = r.id);
  doomed := array_cat(gone, shells);
  FOREACH tab IN ARRAY ARRAY['catalog_revisions','category_entries','category_translations','product_entries',
    'product_translations','product_variants','variant_translations','modifier_groups','modifier_group_translations',
    'modifier_options','modifier_option_translations','catalog_media_refs','catalog_submissions','catalog_approvals',
    'catalog_workflow_events','products'] LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', tab);
  END LOOP;
  DELETE FROM public.modifier_option_translations WHERE revision_id = ANY(doomed);
  DELETE FROM public.modifier_options WHERE revision_id = ANY(doomed);
  DELETE FROM public.modifier_group_translations WHERE revision_id = ANY(doomed);
  DELETE FROM public.modifier_groups WHERE revision_id = ANY(doomed);
  DELETE FROM public.variant_translations WHERE revision_id = ANY(doomed);
  DELETE FROM public.product_variants WHERE revision_id = ANY(doomed);
  DELETE FROM public.catalog_media_refs WHERE revision_id = ANY(doomed);
  DELETE FROM public.product_translations WHERE revision_id = ANY(doomed);
  DELETE FROM public.product_entries WHERE revision_id = ANY(doomed);
  DELETE FROM public.category_translations WHERE revision_id = ANY(doomed);
  DELETE FROM public.category_entries WHERE revision_id = ANY(doomed);
  DELETE FROM public.catalog_workflow_events WHERE revision_id = ANY(gone);
  DELETE FROM public.catalog_approvals WHERE revision_id = ANY(gone);
  DELETE FROM public.catalog_submissions WHERE revision_id = ANY(gone);
  DELETE FROM public.catalog_revisions WHERE id = ANY(gone);
  DELETE FROM public.products p WHERE NOT EXISTS (SELECT 1 FROM public.product_entries e WHERE e.product_id = p.id);
  IF EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product identity is still referenced' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.catalog_deletion_log (actor_id, product_slug, product_name) VALUES (p_actor, v_slug, v_name);
  FOREACH tab IN ARRAY ARRAY['catalog_revisions','category_entries','category_translations','product_entries',
    'product_translations','product_variants','variant_translations','modifier_groups','modifier_group_translations',
    'modifier_options','modifier_option_translations','catalog_media_refs','catalog_submissions','catalog_approvals',
    'catalog_workflow_events','products'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', tab);
  END LOOP;
  RETURN jsonb_build_object('slug', v_slug, 'name', v_name, 'purgedRevisions', cardinality(gone), 'retainedShells', cardinality(shells));
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.catalog_purge_product(uuid, text) FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE cms_name text;
BEGIN
  IF current_user='tiny_osaka_test_owner' THEN cms_name := 'tiny_osaka_test_cms';
  ELSIF current_user='tiny_osaka_dev_owner' THEN cms_name := 'tiny_osaka_dev_cms';
  ELSE RAISE EXCEPTION 'Unexpected catalog purge migration owner'; END IF;
  EXECUTE format('GRANT SELECT ON public.catalog_deletion_log TO %I', cms_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.catalog_purge_product(uuid, text) TO %I', cms_name);
END $$;
