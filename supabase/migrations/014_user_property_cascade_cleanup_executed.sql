-- ================================================================
-- Migration 014: Cascade property cleanup from user deletion
-- ================================================================
-- Goal:
-- 1. When a user is deleted, their properties should be deleted automatically.
-- 2. Property-linked DB rows already cascade from properties(id).
-- 3. Property media stored in the "listing" bucket under "<property_id>/..."
--    should also be removed when the property row disappears, including when
--    that delete is caused by deleting the owning user.

BEGIN;

-- 1) Ensure properties owned/managed by a user are removed automatically.
DO $$
DECLARE
  c text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'properties'
      AND column_name = 'agent_id'
  ) THEN
    -- Remove already-orphaned properties before re-adding the FK, otherwise the
    -- new constraint can fail to validate in environments with historical drift.
    DELETE FROM properties p
    WHERE p.agent_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = p.agent_id
      );

    SELECT conname
    INTO c
    FROM pg_constraint
    WHERE conrelid = 'properties'::regclass
      AND confrelid = 'users'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'properties'::regclass
            AND attname = 'agent_id'
            AND NOT attisdropped
        )
      ];

    IF c IS NOT NULL THEN
      EXECUTE 'ALTER TABLE properties DROP CONSTRAINT ' || quote_ident(c);
    END IF;

    EXECUTE '
      ALTER TABLE properties
      ADD CONSTRAINT properties_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
    ';
  END IF;
END $$;

-- 2) Queue storage cleanup for the deleted property's media files.
--    Supabase Storage files should not be deleted by directly mutating
--    storage.objects from SQL. We persist the required cleanup work here so an
--    app worker or edge function can safely remove the real files via the
--    Storage API.
CREATE TABLE IF NOT EXISTS property_storage_cleanup_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id UUID NOT NULL,
  bucket_id TEXT NOT NULL,
  storage_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_property_storage_cleanup_queue_pending
  ON property_storage_cleanup_queue (processed_at, created_at);

CREATE OR REPLACE FUNCTION queue_property_listing_storage_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO property_storage_cleanup_queue (
    property_id,
    bucket_id,
    storage_prefix
  ) VALUES (
    OLD.id,
    'listing',
    OLD.id::text || '/'
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_property_listing_storage_cleanup ON properties;

CREATE TRIGGER trg_queue_property_listing_storage_cleanup
AFTER DELETE ON properties
FOR EACH ROW
EXECUTE FUNCTION queue_property_listing_storage_cleanup();

COMMIT;
