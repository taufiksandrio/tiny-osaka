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
  EXECUTE format('GRANT INSERT ON public.media_assets,public.media_events TO %I',cms_name);
  EXECUTE format('GRANT UPDATE,DELETE ON public.page_media_refs,public.catalog_media_refs TO %I',cms_name);
END;
$$;
--> statement-breakpoint
-- Server-only byte delivery capability: only exact live approved references,
-- including their posters. Never accept a caller-supplied path or revision ID.
CREATE FUNCTION public.public_read_media(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
SELECT jsonb_build_object('id',a.id,'kind',a.kind,'mime',a.mime,'storageKey',a.storage_key,
 'byteSize',a.byte_size,'checksum',a.checksum)
FROM public.media_assets a WHERE a.id=p_id AND a.kind IN ('image','video') AND (
 EXISTS (SELECT 1 FROM public.page_publications live
  JOIN public.page_revisions r ON r.id=live.revision_id AND r.page_key=live.page_key AND r.status='published' AND r.content_hash=live.content_hash
  JOIN public.page_approvals approved ON approved.revision_id=r.id AND approved.content_hash=live.content_hash
  JOIN public.page_media_refs ref ON ref.revision_id=r.id JOIN public.media_assets direct ON direct.id=ref.asset_id
  WHERE direct.id=a.id OR direct.poster_id=a.id)
 OR EXISTS (SELECT 1 FROM public.catalog_publication live
  JOIN public.catalog_revisions r ON r.id=live.revision_id AND r.status='published' AND r.content_hash=live.content_hash
  JOIN public.catalog_approvals approved ON approved.revision_id=r.id AND approved.content_hash=live.content_hash
  JOIN public.catalog_media_refs ref ON ref.revision_id=r.id JOIN public.media_assets direct ON direct.id=ref.asset_id
  WHERE live.id=1 AND (direct.id=a.id OR direct.poster_id=a.id)))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.public_read_media(uuid) FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE app_name text;
BEGIN
  IF current_user='tiny_osaka_test_owner' THEN app_name := 'tiny_osaka_test_app';
  ELSIF current_user='tiny_osaka_dev_owner' THEN app_name := 'tiny_osaka_dev_app';
  ELSE RAISE EXCEPTION 'Unexpected public media owner'; END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.public_read_media(uuid) TO %I',app_name);
END;
$$;
