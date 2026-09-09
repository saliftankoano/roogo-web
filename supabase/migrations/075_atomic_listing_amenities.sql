-- Capture creation-time amenities in the same transaction as the property and
-- its payment-consumption record. Older writers omit this nullable snapshot.
BEGIN;
ALTER TABLE public.properties ADD COLUMN creation_amenity_names TEXT[];

CREATE FUNCTION public.attach_creation_amenities()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.property_amenities(property_id, amenity_id)
  SELECT NEW.id, amenity.id
  FROM public.amenities AS amenity
  WHERE amenity.name = ANY(NEW.creation_amenity_names);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_creation_amenities() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER attach_creation_amenities
AFTER INSERT ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.attach_creation_amenities();
COMMIT;
