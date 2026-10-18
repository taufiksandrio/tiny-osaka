-- ADR-039: remove locale, alt_en and caption_en. Structural only; hand-reviewed; NOT applied by agents.
-- Local test/dev databases only. The runner hook (scripts/lib/reset-local-content.mjs) empties hashed
-- content in the same transaction BEFORE this file runs; this file refuses to run on a database with content.
DO $$
DECLARE tab text; n bigint;
BEGIN
  FOREACH tab IN ARRAY ARRAY['category_translations','product_translations','variant_translations','modifier_group_translations',
    'modifier_option_translations','page_translations','catalog_media_refs','page_media_refs','catalog_revisions','page_revisions'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', tab) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Refusing structural change: % holds content; run the reviewed local reset first', tab USING ERRCODE = '23514'; END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE public.category_translations DROP CONSTRAINT IF EXISTS category_translations_locale;
--> statement-breakpoint
ALTER TABLE public.category_translations DROP CONSTRAINT IF EXISTS category_translations_pk;
--> statement-breakpoint
ALTER TABLE public.category_translations DROP COLUMN IF EXISTS locale;
--> statement-breakpoint
ALTER TABLE public.category_translations ADD CONSTRAINT category_translations_pk PRIMARY KEY (revision_id, category_id);
--> statement-breakpoint
ALTER TABLE public.product_translations DROP CONSTRAINT IF EXISTS product_translations_locale;
--> statement-breakpoint
ALTER TABLE public.product_translations DROP CONSTRAINT IF EXISTS product_translations_pk;
--> statement-breakpoint
ALTER TABLE public.product_translations DROP COLUMN IF EXISTS locale;
--> statement-breakpoint
ALTER TABLE public.product_translations ADD CONSTRAINT product_translations_pk PRIMARY KEY (revision_id, product_id);
--> statement-breakpoint
ALTER TABLE public.variant_translations DROP CONSTRAINT IF EXISTS variant_translations_locale;
--> statement-breakpoint
ALTER TABLE public.variant_translations DROP CONSTRAINT IF EXISTS variant_translations_pk;
--> statement-breakpoint
ALTER TABLE public.variant_translations DROP COLUMN IF EXISTS locale;
--> statement-breakpoint
ALTER TABLE public.variant_translations ADD CONSTRAINT variant_translations_pk PRIMARY KEY (revision_id, product_id, variant_id);
--> statement-breakpoint
ALTER TABLE public.modifier_group_translations DROP CONSTRAINT IF EXISTS modifier_group_translations_locale;
--> statement-breakpoint
ALTER TABLE public.modifier_group_translations DROP CONSTRAINT IF EXISTS modifier_group_translations_pk;
--> statement-breakpoint
ALTER TABLE public.modifier_group_translations DROP COLUMN IF EXISTS locale;
--> statement-breakpoint
ALTER TABLE public.modifier_group_translations ADD CONSTRAINT modifier_group_translations_pk PRIMARY KEY (revision_id, product_id, group_id);
--> statement-breakpoint
ALTER TABLE public.modifier_option_translations DROP CONSTRAINT IF EXISTS modifier_option_translations_locale;
--> statement-breakpoint
ALTER TABLE public.modifier_option_translations DROP CONSTRAINT IF EXISTS modifier_option_translations_pk;
--> statement-breakpoint
ALTER TABLE public.modifier_option_translations DROP COLUMN IF EXISTS locale;
--> statement-breakpoint
ALTER TABLE public.modifier_option_translations ADD CONSTRAINT modifier_option_translations_pk PRIMARY KEY (revision_id, product_id, group_id, option_id);
--> statement-breakpoint
ALTER TABLE public.page_translations DROP CONSTRAINT IF EXISTS page_translations_locale;
--> statement-breakpoint
ALTER TABLE public.page_translations DROP CONSTRAINT IF EXISTS page_translations_pk;
--> statement-breakpoint
ALTER TABLE public.page_translations DROP COLUMN IF EXISTS locale;
--> statement-breakpoint
ALTER TABLE public.page_translations ADD CONSTRAINT page_translations_pk PRIMARY KEY (revision_id);
--> statement-breakpoint
ALTER TABLE public.catalog_media_refs DROP CONSTRAINT IF EXISTS catalog_media_refs_text;
--> statement-breakpoint
ALTER TABLE public.catalog_media_refs DROP COLUMN IF EXISTS alt_en;
--> statement-breakpoint
ALTER TABLE public.catalog_media_refs DROP COLUMN IF EXISTS caption_en;
--> statement-breakpoint
ALTER TABLE public.catalog_media_refs ADD CONSTRAINT catalog_media_refs_text CHECK (length(alt_id) <= 500 AND length(caption_id) <= 2000);
--> statement-breakpoint
ALTER TABLE public.page_media_refs DROP CONSTRAINT IF EXISTS page_media_refs_text;
--> statement-breakpoint
ALTER TABLE public.page_media_refs DROP COLUMN IF EXISTS alt_en;
--> statement-breakpoint
ALTER TABLE public.page_media_refs DROP COLUMN IF EXISTS caption_en;
--> statement-breakpoint
ALTER TABLE public.page_media_refs ADD CONSTRAINT page_media_refs_text CHECK (length(alt_id) <= 500 AND length(caption_id) <= 2000);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.public_read_catalog(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.public_read_page(text,text);
--> statement-breakpoint
CREATE FUNCTION public.public_read_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
SELECT jsonb_build_object(
 'revision',jsonb_build_object('id',r.id,'version',r.version),
 'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.category_id,'slug',c.slug,'title',t.title,'description',t.description,'sortOrder',e.sort_order) ORDER BY e.sort_order,e.category_id),'[]'::jsonb)
   FROM public.category_entries e JOIN public.categories c ON c.id=e.category_id JOIN public.category_translations t ON t.revision_id=e.revision_id AND t.category_id=e.category_id WHERE e.revision_id=r.id),
 'products',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',e.product_id,'slug',p.slug,'categoryId',e.category_id,'sortOrder',e.sort_order,'title',t.title,'description',t.description,
   'variants',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'basePrice',v.base_price,'sortOrder',v.sort_order,'title',vt.title,'description',vt.description) ORDER BY v.sort_order,v.id),'[]'::jsonb)
     FROM public.product_variants v JOIN public.variant_translations vt ON vt.revision_id=v.revision_id AND vt.product_id=v.product_id AND vt.variant_id=v.id WHERE v.revision_id=r.id AND v.product_id=e.product_id),
   'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'code',g.code,'selectionType',g.selection_type,'minSelections',g.min_selections,'maxSelections',g.max_selections,'sortOrder',g.sort_order,'title',gt.title,
     'options',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'code',o.code,'priceDelta',o.price_delta,'sortOrder',o.sort_order,'title',ot.title) ORDER BY o.sort_order,o.id),'[]'::jsonb)
       FROM public.modifier_options o JOIN public.modifier_option_translations ot ON ot.revision_id=o.revision_id AND ot.product_id=o.product_id AND ot.group_id=o.group_id AND ot.option_id=o.id WHERE o.revision_id=r.id AND o.product_id=e.product_id AND o.group_id=g.id)) ORDER BY g.sort_order,g.id),'[]'::jsonb)
     FROM public.modifier_groups g JOIN public.modifier_group_translations gt ON gt.revision_id=g.revision_id AND gt.product_id=g.product_id AND gt.group_id=g.id WHERE g.revision_id=r.id AND g.product_id=e.product_id)
 ) ORDER BY e.sort_order,e.product_id),'[]'::jsonb)
 FROM public.product_entries e JOIN public.products p ON p.id=e.product_id JOIN public.product_translations t ON t.revision_id=e.revision_id AND t.product_id=e.product_id WHERE e.revision_id=r.id),
 'media',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'productId',m.product_id,'sortOrder',m.sort_order,'alt',m.alt_id,'caption',m.caption_id,'asset',jsonb_build_object('id',a.id,'kind',a.kind,'width',a.width,'height',a.height,'durationMs',a.duration_ms,'externalId',a.external_id),'poster',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'kind',p.kind,'width',p.width,'height',p.height,'durationMs',p.duration_ms,'externalId',p.external_id) END) ORDER BY m.sort_order,m.id),'[]'::jsonb) FROM public.catalog_media_refs m JOIN public.media_assets a ON a.id=m.asset_id LEFT JOIN public.media_assets p ON p.id=a.poster_id WHERE m.revision_id=r.id)
)
FROM public.catalog_publication live JOIN public.catalog_revisions r ON r.id=live.revision_id AND r.content_hash=live.content_hash AND r.status='published'
JOIN public.catalog_approvals a ON a.revision_id=r.id AND a.content_hash=live.content_hash
WHERE live.id=1
$$;
--> statement-breakpoint
CREATE FUNCTION public.public_read_page(p_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
SELECT jsonb_build_object('pageKey',r.page_key,'template',p.template,'revisionId',r.id,'version',r.version,'fields',t.fields,'media',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sortOrder',m.sort_order,'alt',m.alt_id,'caption',m.caption_id,'asset',jsonb_build_object('id',a.id,'kind',a.kind,'width',a.width,'height',a.height,'durationMs',a.duration_ms,'externalId',a.external_id),'poster',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'kind',p.kind,'width',p.width,'height',p.height,'durationMs',p.duration_ms,'externalId',p.external_id) END) ORDER BY m.sort_order,m.id),'[]'::jsonb) FROM public.page_media_refs m JOIN public.media_assets a ON a.id=m.asset_id LEFT JOIN public.media_assets p ON p.id=a.poster_id WHERE m.revision_id=r.id))
FROM public.page_publications live JOIN public.page_revisions r ON r.id=live.revision_id AND r.page_key=live.page_key AND r.content_hash=live.content_hash AND r.status='published'
JOIN public.page_approvals a ON a.revision_id=r.id AND a.content_hash=live.content_hash
JOIN public.pages p ON p.key=r.page_key
JOIN public.page_translations t ON t.revision_id=r.id
WHERE live.page_key=p_key
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.public_read_catalog() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.public_read_page(text) FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE app_role text;
BEGIN
  IF current_user='tiny_osaka_test_owner' THEN app_role := 'tiny_osaka_test_app';
  ELSIF current_user='tiny_osaka_dev_owner' THEN app_role := 'tiny_osaka_dev_app';
  ELSIF current_user='tiny_osaka_staging_owner' THEN app_role := 'tiny_osaka_staging_app';
  ELSIF current_user='tiny_osaka_production_owner' THEN app_role := 'tiny_osaka_production_app';
  ELSE RAISE EXCEPTION 'Refusing public-read grants outside reviewed local owner'; END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.public_read_catalog() TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.public_read_page(text) TO %I',app_role);
END $$;
--> statement-breakpoint
-- Only change versus 0014: the product name comes from the newest translation row (no locale filter).
-- CREATE OR REPLACE keeps SECURITY DEFINER, search_path, owner and the existing ACL.
CREATE OR REPLACE FUNCTION public.catalog_purge_product(p_product_id uuid, p_actor text) RETURNS jsonb
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
    WHERE t.product_id = p_product_id ORDER BY r.created_at DESC LIMIT 1;
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
