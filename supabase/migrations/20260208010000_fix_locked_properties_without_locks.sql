-- Migration: Fix data inconsistency - properties marked as "locked" without lock records
-- This resets properties that are marked as locked but have no corresponding entry in property_locks

-- Log how many properties will be affected
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO affected_count
  FROM properties 
  WHERE status = 'locked'
    AND NOT EXISTS (
      SELECT 1 FROM property_locks 
      WHERE property_id = properties.id
    );
  
  RAISE NOTICE 'Found % properties with locked status but no lock records', affected_count;
END $$;

-- Reset the status to 'en_ligne' for properties that are locked but have no lock record
UPDATE properties 
SET status = 'en_ligne'
WHERE status = 'locked'
  AND NOT EXISTS (
    SELECT 1 FROM property_locks 
    WHERE property_id = properties.id
  );

-- Log the result
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Reset status for % properties from locked to en_ligne', updated_count;
END $$;
