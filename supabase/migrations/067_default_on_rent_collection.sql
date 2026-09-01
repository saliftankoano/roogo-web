-- 067: Monthly rent collection is on by default with an owner-controlled opt-out.

BEGIN;

ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS rent_collection_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rent_collection_disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rent_collection_disabled_by UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rent_collection_terms_version TEXT NOT NULL
    DEFAULT 'monthly-collection-default-on-2026-09-01';

-- Imported leases were already being managed outside Roogo. Keep them outside
-- the collection service until the owner explicitly enables it in the app.
UPDATE public.rental_agreements
SET
  rent_collection_enabled = FALSE,
  rent_collection_disabled_at = COALESCE(imported_at, created_at, NOW())
WHERE signature_source = 'offline_import'
   OR property_frequence = 'journalier';

CREATE OR REPLACE FUNCTION public.set_imported_lease_collection_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.signature_source = 'offline_import'
     OR NEW.property_frequence = 'journalier' THEN
    NEW.rent_collection_enabled := FALSE;
    NEW.rent_collection_disabled_at := COALESCE(
      NEW.imported_at,
      NEW.created_at,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_agreements_import_collection_default
  ON public.rental_agreements;
CREATE TRIGGER rental_agreements_import_collection_default
  BEFORE INSERT OR UPDATE OF signature_source
  ON public.rental_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_imported_lease_collection_default();

REVOKE ALL ON FUNCTION public.set_imported_lease_collection_default()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_imported_lease_collection_default()
  TO service_role;

CREATE INDEX IF NOT EXISTS idx_rental_agreements_rent_collection
  ON public.rental_agreements(owner_id, rent_collection_enabled)
  WHERE property_frequence = 'mensuel';

COMMIT;
