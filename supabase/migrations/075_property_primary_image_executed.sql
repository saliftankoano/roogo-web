BEGIN;

-- One source of truth: property_images.is_primary. Serialize selections for a
-- property and validate the target before changing any flags.
CREATE OR REPLACE FUNCTION public.set_property_primary_image(
  p_property_id uuid, p_url text
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
BEGIN
  PERFORM id FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = 'P0002';
  END IF;

  -- Lock the gallery too, so a concurrent deletion cannot remove the target
  -- between validation and the update. Duplicate legacy URLs select one row.
  PERFORM id FROM public.property_images
    WHERE property_id = p_property_id ORDER BY id FOR UPDATE;
  SELECT id INTO target_id FROM public.property_images
    WHERE property_id = p_property_id AND url = p_url ORDER BY id LIMIT 1;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.property_images SET is_primary = (id = target_id)
    WHERE property_id = p_property_id;
  RETURN p_url;
END;
$$;

REVOKE ALL ON FUNCTION public.set_property_primary_image(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_property_primary_image(uuid, text)
  TO service_role;

-- Append a computed column while preserving each view's existing projection,
-- privacy filtering, column order, security options and grants. Do not rebuild
-- the public view from the private view (sale-owner fields must stay redacted).
DO $$
DECLARE
  view_name text;
  definition text;
  options text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['property_details', 'public_property_details']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = view_name
        AND column_name = 'primary_image'
    ) THEN
      definition := rtrim(pg_get_viewdef(('public.' || view_name)::regclass, true), E';\n ');
      SELECT CASE WHEN reloptions IS NULL THEN ''
        ELSE ' WITH (' || array_to_string(reloptions, ', ') || ')' END
        INTO options FROM pg_class
        WHERE oid = ('public.' || view_name)::regclass;
      EXECUTE format(
        'CREATE OR REPLACE VIEW public.%I%s AS SELECT details.*, '
        || '(SELECT image.url FROM public.property_images image '
        || 'WHERE image.property_id = details.id AND image.is_primary = true '
        || 'ORDER BY image.id LIMIT 1) AS primary_image FROM (%s) details',
        view_name, options, definition
      );
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
