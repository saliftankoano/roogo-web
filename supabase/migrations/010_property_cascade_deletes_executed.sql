-- ================================================================
-- Migration 010: Add ON DELETE CASCADE to all property FK references
-- ================================================================
-- Deleting a property should automatically clean up all related rows.
-- Each block checks column existence before touching constraints,
-- so the script is safe to run even if a table or column doesn't exist yet.
-- Transactions get ON DELETE SET NULL (preserve financial records, just unlink).

BEGIN;

-- Reusable helper: drop any FK from <child_table> pointing to properties, then
-- recreate it on <col> with the specified ON DELETE action.
-- We look up the real constraint name from pg_constraint to be safe.

DO $$
DECLARE
  c text;
BEGIN
  -- 1. property_amenities.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_amenities' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'property_amenities'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE property_amenities DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE property_amenities ADD CONSTRAINT property_amenities_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 2. property_images.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_images' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'property_images'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE property_images DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE property_images ADD CONSTRAINT property_images_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 3. property_views.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_views' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'property_views'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE property_views DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE property_views ADD CONSTRAINT property_views_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 4. property_views_daily.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_views_daily' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'property_views_daily'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE property_views_daily DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE property_views_daily ADD CONSTRAINT property_views_daily_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 5. property_views_geo_daily.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_views_geo_daily' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'property_views_geo_daily'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE property_views_geo_daily DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE property_views_geo_daily ADD CONSTRAINT property_views_geo_daily_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 6. favorites.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'favorites' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'favorites'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE favorites DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE favorites ADD CONSTRAINT favorites_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 7. applications.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'applications'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE applications DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE applications ADD CONSTRAINT applications_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 8. open_house_bookings.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'open_house_bookings' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'open_house_bookings'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE open_house_bookings DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE open_house_bookings ADD CONSTRAINT open_house_bookings_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 9. property_locks.property_id → properties(id) CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_locks' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'property_locks'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE property_locks DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE property_locks ADD CONSTRAINT property_locks_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE';
  END IF;

  -- 10. transactions.property_id → properties(id) SET NULL
  --     (preserve financial records, just unlink the deleted property)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'property_id'
  ) THEN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'transactions'::regclass AND confrelid = 'properties'::regclass AND contype = 'f';
    IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE transactions DROP CONSTRAINT ' || quote_ident(c); END IF;
    EXECUTE 'ALTER TABLE transactions ADD CONSTRAINT transactions_property_id_fkey
             FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL';
  END IF;

END $$;

-- Note: rental_agreements.property_id and rent_schedules.property_id already have
-- ON DELETE CASCADE from migration 006_rental_lifecycle.sql — no changes needed.

COMMIT;
