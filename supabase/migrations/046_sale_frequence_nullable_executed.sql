-- Sales (listing_type = 'vendre') have no rental frequency or advance months:
-- the API inserts frequence = NULL, loyer_avance_mois = NULL, period = NULL
-- for them (app/api/properties/route.ts). Both columns were made NOT NULL by
-- pre-sales migrations (028 for frequence) and migration 039 (sale listings)
-- never relaxed them — so EVERY sale submission failed at insert with 23502,
-- surfaced in the mobile app as the generic "Erreur lors de la soumission".
-- Verified against the live DB on 2026-07-08 by replaying the API's insert:
-- frequence and loyer_avance_mois are the only two blockers.

ALTER TABLE public.properties
  ALTER COLUMN frequence DROP NOT NULL;

ALTER TABLE public.properties
  ALTER COLUMN loyer_avance_mois DROP NOT NULL;

-- Preserve the rental invariant the NOT NULLs were protecting: only sales may
-- omit these fields.
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_rental_fields_required;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_rental_fields_required
  CHECK (
    listing_type = 'vendre'
    OR (frequence IS NOT NULL AND loyer_avance_mois IS NOT NULL)
  );
