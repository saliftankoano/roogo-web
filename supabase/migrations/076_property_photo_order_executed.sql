BEGIN;

ALTER TABLE public.property_images ADD COLUMN IF NOT EXISTS sort_order integer;
-- Keep the selected cover, then preserve the legacy URL order of the gallery.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY property_id
    ORDER BY is_primary DESC NULLS LAST, url, id) - 1 AS position
  FROM public.property_images
)
UPDATE public.property_images image SET sort_order = ranked.position
FROM ranked WHERE image.id = ranked.id AND image.sort_order IS NULL;
ALTER TABLE public.property_images ALTER COLUMN sort_order SET NOT NULL;
UPDATE public.property_images SET is_primary = (sort_order = 0);
CREATE INDEX IF NOT EXISTS property_images_gallery_order
  ON public.property_images(property_id, sort_order, id);

CREATE OR REPLACE FUNCTION public.reorder_property_images(
  p_property_id uuid, p_urls text[], p_expected_urls text[]
) RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_urls text[];
BEGIN
  PERFORM id FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM id FROM public.property_images WHERE property_id = p_property_id ORDER BY id FOR UPDATE;
  SELECT array_agg(url ORDER BY sort_order, id) INTO current_urls
    FROM public.property_images WHERE property_id = p_property_id;
  IF p_urls IS NULL OR cardinality(p_urls) = 0
    OR cardinality(p_urls) <> cardinality(current_urls)
    OR EXISTS (SELECT 1 FROM unnest(p_urls) url WHERE url IS NULL OR btrim(url) = '')
    OR (SELECT count(DISTINCT url) FROM unnest(p_urls) url) <> cardinality(p_urls)
    OR NOT (p_urls @> current_urls AND current_urls @> p_urls) THEN
    RAISE EXCEPTION 'Order must contain every current photo exactly once' USING ERRCODE = '22023';
  END IF;
  -- A retry of an already committed order is successful, even if its old
  -- expected snapshot is now stale. Different stale arrangements must reload.
  IF current_urls = p_urls THEN RETURN current_urls; END IF;
  IF p_expected_urls IS DISTINCT FROM current_urls THEN
    RAISE EXCEPTION 'Gallery changed; reload before rearranging' USING ERRCODE = '40001';
  END IF;
  UPDATE public.property_images image
    SET sort_order = wanted.position - 1, is_primary = (wanted.position = 1)
    FROM unnest(p_urls) WITH ORDINALITY AS wanted(url, position)
    WHERE image.property_id = p_property_id AND image.url = wanted.url;
  RETURN p_urls;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_property_images(uuid,text[],text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_property_images(uuid,text[],text[]) TO service_role;

-- Older mobile clients may still use the single-cover action. Move that photo
-- to the front as well, keeping the order/cover rule consistent across clients.
CREATE OR REPLACE FUNCTION public.set_property_primary_image(p_property_id uuid, p_url text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_urls text[]; wanted_urls text[];
BEGIN
  PERFORM id FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM id FROM public.property_images WHERE property_id = p_property_id ORDER BY id FOR UPDATE;
  SELECT array_agg(url ORDER BY sort_order,id) INTO current_urls
    FROM public.property_images WHERE property_id = p_property_id;
  IF NOT coalesce(p_url = ANY(current_urls), false) THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;
  wanted_urls := ARRAY[p_url] || array_remove(current_urls,p_url);
  PERFORM public.reorder_property_images(p_property_id,wanted_urls,current_urls);
  RETURN p_url;
END;
$$;

-- Uploads append rather than displacing the existing cover. Locking the parent
-- coordinates uploads with reorder requests and assigns deterministic positions.
CREATE OR REPLACE FUNCTION public.append_property_image()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM id FROM public.properties WHERE id = NEW.property_id FOR UPDATE;
  SELECT coalesce(max(sort_order),-1)+1 INTO NEW.sort_order
    FROM public.property_images WHERE property_id = NEW.property_id;
  NEW.is_primary := (NEW.sort_order = 0);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS append_property_image ON public.property_images;
CREATE TRIGGER append_property_image BEFORE INSERT ON public.property_images
  FOR EACH ROW EXECUTE FUNCTION public.append_property_image();

-- Deleting the first photo promotes the first remaining one. No storage changes
-- are performed by these triggers, and property cascades simply have no gallery.
CREATE OR REPLACE FUNCTION public.reconcile_property_image_order()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM id FROM public.properties WHERE id = OLD.property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN OLD; END IF;
  WITH ranked AS (
    SELECT id,row_number() OVER (ORDER BY sort_order,id)-1 AS position
    FROM public.property_images WHERE property_id = OLD.property_id
  ) UPDATE public.property_images image
    SET sort_order = ranked.position, is_primary = (ranked.position = 0)
    FROM ranked WHERE image.id = ranked.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS reconcile_property_image_order ON public.property_images;
CREATE TRIGGER reconcile_property_image_order AFTER DELETE ON public.property_images
  FOR EACH ROW EXECUTE FUNCTION public.reconcile_property_image_order();

-- The API acquires the parent lock before deletion to use the same lock order
-- as uploads and reorder requests. The reconciliation trigger runs in that tx.
CREATE OR REPLACE FUNCTION public.delete_property_image(p_property_id uuid,p_url text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE deleted_count integer;
BEGIN
  PERFORM id FROM public.properties WHERE id=p_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found' USING ERRCODE='P0002'; END IF;
  DELETE FROM public.property_images WHERE property_id=p_property_id AND url=p_url;
  GET DIAGNOSTICS deleted_count=ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_property_image(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_property_image(uuid,text) TO service_role;

-- Both views return the gallery in saved order, with its first photo as cover.
-- Preserve every other column and the separate public/private privacy policies.
DO $$
DECLARE view_name text; definition text; options text; projection text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['property_details','public_property_details'] LOOP
    definition := rtrim(pg_get_viewdef(('public.'||view_name)::regclass,true),E';\n ');
    SELECT CASE WHEN reloptions IS NULL THEN '' ELSE ' WITH ('||array_to_string(reloptions,', ')||')' END
      INTO options FROM pg_class WHERE oid = ('public.'||view_name)::regclass;
    SELECT string_agg(CASE attname
      WHEN 'images' THEN '(SELECT array_agg(image.url ORDER BY image.sort_order,image.id) FROM public.property_images image WHERE image.property_id=details.id) AS images'
      WHEN 'primary_image' THEN '(SELECT image.url FROM public.property_images image WHERE image.property_id=details.id ORDER BY image.sort_order,image.id LIMIT 1) AS primary_image'
      ELSE format('details.%I',attname) END,', ' ORDER BY attnum)
      INTO projection FROM pg_attribute WHERE attrelid=('public.'||view_name)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I%s AS SELECT %s FROM (%s) details',view_name,options,projection,definition);
  END LOOP;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
