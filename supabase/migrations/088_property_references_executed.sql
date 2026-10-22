-- 088: short public reference codes for properties (VEN-014, LOC-007).
--
-- Why: listings are filed in Google Drive by property. The slug is unique but
-- long and not shown on the page. A short code, shown on every listing card
-- and page, lets the team match a listing to its Drive folder at a glance.
--
-- Shape: VEN-NNN for sales (listing_type = 'vendre'), LOC-NNN for rentals.
-- Numbers come from two sequences, are assigned once at insert by a trigger,
-- and never change (the trigger refuses an update). Existing rows are numbered
-- in creation order (created_at, then id), so 49 rows become VEN-001..VEN-023
-- and LOC-001..LOC-026 on the day this runs.
--
-- The two listing views are extended the same way 075 added primary_image:
-- append one computed column and keep every other column, filter, option and
-- grant exactly as it is (the public view must stay redacted).

BEGIN;

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS reference text;

CREATE SEQUENCE IF NOT EXISTS public.property_reference_vendre_seq;
CREATE SEQUENCE IF NOT EXISTS public.property_reference_louer_seq;

-- Backfill in creation order. Offsets by any code already assigned, so a
-- partial earlier run cannot collide.
WITH numbered AS (
  SELECT
    p.id,
    CASE WHEN lower(coalesce(p.listing_type::text, 'louer')) = 'vendre'
      THEN 'VEN' ELSE 'LOC' END AS prefix,
    row_number() OVER (
      PARTITION BY (lower(coalesce(p.listing_type::text, 'louer')) = 'vendre')
      ORDER BY p.created_at, p.id
    ) AS n
  FROM public.properties p
  WHERE p.reference IS NULL
),
offsets AS (
  SELECT
    'VEN' AS prefix,
    coalesce(max(substring(reference FROM 5)::int), 0) AS used
  FROM public.properties WHERE reference LIKE 'VEN-%'
  UNION ALL
  SELECT
    'LOC',
    coalesce(max(substring(reference FROM 5)::int), 0)
  FROM public.properties WHERE reference LIKE 'LOC-%'
)
UPDATE public.properties p
SET reference = numbered.prefix || '-' || lpad((numbered.n + offsets.used)::text, 3, '0')
FROM numbered
JOIN offsets ON offsets.prefix = numbered.prefix
WHERE p.id = numbered.id;

-- Continue each sequence after the highest number in use. is_called is true
-- only when a code exists, so an empty table still starts at 001.
SELECT setval(
  'public.property_reference_vendre_seq',
  coalesce((SELECT max(substring(reference FROM 5)::int)
            FROM public.properties WHERE reference LIKE 'VEN-%'), 1),
  EXISTS (SELECT 1 FROM public.properties WHERE reference LIKE 'VEN-%')
);
SELECT setval(
  'public.property_reference_louer_seq',
  coalesce((SELECT max(substring(reference FROM 5)::int)
            FROM public.properties WHERE reference LIKE 'LOC-%'), 1),
  EXISTS (SELECT 1 FROM public.properties WHERE reference LIKE 'LOC-%')
);

ALTER TABLE public.properties ALTER COLUMN reference SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS properties_reference_key
  ON public.properties (reference);

-- Assign on insert, refuse any later change. SECURITY DEFINER so the insert
-- works for any role that may create a listing (the sequences are not
-- granted to them directly).
CREATE OR REPLACE FUNCTION public.set_property_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reference IS NULL THEN
      IF lower(coalesce(NEW.listing_type::text, 'louer')) = 'vendre' THEN
        NEW.reference := 'VEN-' || lpad(nextval('public.property_reference_vendre_seq')::text, 3, '0');
      ELSE
        NEW.reference := 'LOC-' || lpad(nextval('public.property_reference_louer_seq')::text, 3, '0');
      END IF;
    END IF;
  ELSIF NEW.reference IS DISTINCT FROM OLD.reference THEN
    RAISE EXCEPTION 'property reference is immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_set_reference ON public.properties;
CREATE TRIGGER properties_set_reference
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_property_reference();

-- Expose the code through both listing views without changing anything else.
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
        AND column_name = 'reference'
    ) THEN
      definition := rtrim(pg_get_viewdef(('public.' || view_name)::regclass, true), E';\n ');
      SELECT CASE WHEN reloptions IS NULL THEN ''
        ELSE ' WITH (' || array_to_string(reloptions, ', ') || ')' END
        INTO options FROM pg_class
        WHERE oid = ('public.' || view_name)::regclass;
      EXECUTE format(
        'CREATE OR REPLACE VIEW public.%I%s AS SELECT details.*, '
        || '(SELECT prop.reference FROM public.properties prop '
        || 'WHERE prop.id = details.id) AS reference FROM (%s) details',
        view_name, options, definition
      );
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
