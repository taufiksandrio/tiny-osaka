-- Immutable poster rows cannot change or disappear. Remove the redundant row
-- lock so registering video/YouTube needs no UPDATE grant on original assets.
CREATE OR REPLACE FUNCTION public.media_guard_asset() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE poster_kind text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Immutable media metadata' USING ERRCODE = '23514';
  END IF;
  IF NEW.poster_id IS NOT NULL THEN
    SELECT kind INTO poster_kind FROM public.media_assets WHERE id=NEW.poster_id;
    IF poster_kind IS DISTINCT FROM 'image' THEN
      RAISE EXCEPTION 'Registered image poster required' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
