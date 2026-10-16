-- Preserve applied 0002. PL/pgSQL must not resolve NEW.version on approval rows.
-- A nested IF keeps table-specific fields out of the other table's expression.
CREATE OR REPLACE FUNCTION public.catalog_check_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE root public.catalog_revisions;
BEGIN
  SELECT * INTO root FROM public.catalog_revisions WHERE id = NEW.revision_id;
  IF root.status IS NULL OR root.status = 'draft' OR root.content_hash IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'Incomplete catalog transition' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'catalog_submissions' THEN
    IF root.version IS DISTINCT FROM NEW.version THEN
      RAISE EXCEPTION 'Catalog submission version differs' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF root.status NOT IN ('approved','published','archived') THEN
      RAISE EXCEPTION 'Incomplete catalog approval' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
