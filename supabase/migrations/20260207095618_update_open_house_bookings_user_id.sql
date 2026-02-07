-- Migration: Update open_house_bookings.user_id to accept Clerk IDs
-- Changes: Change user_id from uuid to text to store Clerk IDs directly

BEGIN;

-- 1. Drop all RLS policies that reference the user_id column
DROP POLICY IF EXISTS "Users can view their own bookings" ON open_house_bookings;
DROP POLICY IF EXISTS "Users can create their own bookings" ON open_house_bookings;
DROP POLICY IF EXISTS "Users can delete their own bookings" ON open_house_bookings;
DROP POLICY IF EXISTS "Staff can view all bookings" ON open_house_bookings;
DROP POLICY IF EXISTS "Staff can manage all bookings" ON open_house_bookings;

-- 2. Drop the foreign key constraint if it exists
ALTER TABLE open_house_bookings DROP CONSTRAINT IF EXISTS open_house_bookings_user_id_fkey;

-- 3. Change the column type from uuid to text
ALTER TABLE open_house_bookings ALTER COLUMN user_id TYPE text USING user_id::text;

-- 4. Add comment explaining the change
COMMENT ON COLUMN open_house_bookings.user_id IS 'Clerk user ID (text format, e.g., user_xxxxx)';

-- 5. Ensure the column is still not null
ALTER TABLE open_house_bookings ALTER COLUMN user_id SET NOT NULL;

-- 6. Recreate RLS policies with text comparison
-- Note: Since user_id is now text (Clerk ID), we compare directly with auth.uid()::text
-- but Clerk doesn't use Supabase auth, so we'll adjust policies accordingly

-- Users can view their own bookings (comparing Clerk IDs)
CREATE POLICY "Users can view their own bookings" ON open_house_bookings
  FOR SELECT
  USING (user_id = auth.uid()::text OR user_id IN (
    SELECT clerk_id FROM users WHERE id = auth.uid()
  ));

-- Users can create their own bookings
CREATE POLICY "Users can create their own bookings" ON open_house_bookings
  FOR INSERT
  WITH CHECK (user_id IN (
    SELECT clerk_id FROM users WHERE id = auth.uid()
  ));

-- Users can delete their own bookings
CREATE POLICY "Users can delete their own bookings" ON open_house_bookings
  FOR DELETE
  USING (user_id IN (
    SELECT clerk_id FROM users WHERE id = auth.uid()
  ));

-- Staff can view all bookings
CREATE POLICY "Staff can view all bookings" ON open_house_bookings
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND user_type IN ('staff', 'founder')
  ));

-- Staff can manage all bookings
CREATE POLICY "Staff can manage all bookings" ON open_house_bookings
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND user_type IN ('staff', 'founder')
  ));

COMMIT;
