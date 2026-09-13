-- ================================================================
-- Upfront rent months separate from refundable caution
-- ================================================================

BEGIN;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS loyer_avance_mois INTEGER NOT NULL DEFAULT 1;

ALTER TABLE rental_agreements
  ADD COLUMN IF NOT EXISTS loyer_avance_mois INTEGER NOT NULL DEFAULT 1;

ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_loyer_avance_mois_range,
  ADD CONSTRAINT properties_loyer_avance_mois_range
    CHECK (loyer_avance_mois BETWEEN 1 AND 12);

ALTER TABLE rental_agreements
  DROP CONSTRAINT IF EXISTS rental_agreements_loyer_avance_mois_range,
  ADD CONSTRAINT rental_agreements_loyer_avance_mois_range
    CHECK (loyer_avance_mois BETWEEN 1 AND 12);

COMMENT ON COLUMN properties.loyer_avance_mois IS
  'Monthly listings: number of rent months paid upfront at move-in, including the first month.';

COMMENT ON COLUMN rental_agreements.loyer_avance_mois IS
  'Number of rent months covered by the upfront move-in payment, including the first month.';

COMMIT;
