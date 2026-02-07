-- Migration: Disable RLS on open_house_bookings
-- Reason: App uses Clerk auth, not Supabase auth, so RLS policies with auth.uid() don't work

BEGIN;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own bookings" ON open_house_bookings;
DROP POLICY IF EXISTS "Users can create their own bookings" ON open_house_bookings;
DROP POLICY IF EXISTS "Users can delete their own bookings" ON open_house_bookings;
DROP POLICY IF EXISTS "Staff can view all bookings" ON open_house_bookings;
DROP POLICY IF EXISTS "Staff can manage all bookings" ON open_house_bookings;

-- Disable RLS on the table
ALTER TABLE open_house_bookings DISABLE ROW LEVEL SECURITY;

COMMIT;
