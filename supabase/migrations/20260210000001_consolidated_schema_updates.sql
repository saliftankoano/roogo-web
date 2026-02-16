-- Consolidated Migration: All recent schema updates (February 2026)
-- This file combines migrations from 20260207 to 20260210

BEGIN;

-- 1. Update user types and constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_user_types;
UPDATE users SET user_type = 'renter' WHERE user_type = 'buyer';
UPDATE users SET user_type = 'staff' WHERE user_type = 'admin';
ALTER TABLE users ADD CONSTRAINT valid_user_types 
CHECK (user_type IN ('owner', 'agent', 'renter', 'staff', 'founder'));
COMMENT ON COLUMN users.user_type IS 'User type: owner (property owner), agent (real estate agent), renter (looking for property), staff (Roogo team member), founder (company founder)';

-- 2. Update users table with onboarding columns and rename facebook_url
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'facebook_url') THEN
    ALTER TABLE users RENAME COLUMN facebook_url TO professional_link;
  END IF;
END $$;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS whatsapp text,
ADD COLUMN IF NOT EXISTS preferred_city text,
ADD COLUMN IF NOT EXISTS budget_max integer,
ADD COLUMN IF NOT EXISTS service_areas text[],
ADD COLUMN IF NOT EXISTS portfolio_size text,
ADD COLUMN IF NOT EXISTS referral_source text,
ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.professional_link IS 'Professional link (website, Facebook, Instagram, etc.)';
COMMENT ON COLUMN users.whatsapp IS 'WhatsApp contact number';
COMMENT ON COLUMN users.preferred_city IS 'City where the user is looking for property or where their property is located';
COMMENT ON COLUMN users.budget_max IS 'Maximum monthly budget for renters';
COMMENT ON COLUMN users.service_areas IS 'Geographic areas covered by an agent';
COMMENT ON COLUMN users.portfolio_size IS 'Number of properties managed by an agent';
COMMENT ON COLUMN users.referral_source IS 'How the user discovered Roogo';
COMMENT ON COLUMN users.preferences IS 'Type-specific onboarding preferences and notification settings';

-- 3. Update open_house_bookings table
ALTER TABLE open_house_bookings DROP CONSTRAINT IF EXISTS open_house_bookings_user_id_fkey;
ALTER TABLE open_house_bookings ALTER COLUMN user_id TYPE text USING user_id::text;
COMMENT ON COLUMN open_house_bookings.user_id IS 'Clerk user ID (text format, e.g., user_xxxxx)';
ALTER TABLE open_house_bookings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE open_house_bookings DISABLE ROW LEVEL SECURITY;

-- 4. Update property_views and related functions
DROP POLICY IF EXISTS "Users can view their own property view history" ON property_views;
CREATE POLICY "Users can view their own property view history" 
ON property_views FOR SELECT 
USING (clerk_id = auth.jwt() ->> 'sub');

CREATE OR REPLACE FUNCTION get_trending_properties(
    hours_window INTEGER DEFAULT 24,
    result_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    property_id UUID,
    view_count BIGINT,
    unique_viewers BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pv.property_id,
        COUNT(*)::BIGINT as view_count,
        COUNT(DISTINCT pv.clerk_id)::BIGINT as unique_viewers
    FROM property_views pv
    JOIN properties p ON pv.property_id = p.id
    WHERE pv.viewed_at > NOW() - (hours_window || ' hours')::INTERVAL
      AND p.status = 'en_ligne'
    GROUP BY pv.property_id
    ORDER BY view_count DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION aggregate_old_views(days_threshold INTEGER DEFAULT 30)
RETURNS TABLE (aggregated_count BIGINT, deleted_count BIGINT) AS $$
DECLARE
    cutoff_date DATE;
    v_aggregated BIGINT := 0;
    v_deleted BIGINT := 0;
BEGIN
    cutoff_date := CURRENT_DATE - days_threshold;
    
    INSERT INTO property_views_daily (property_id, view_date, total_views, unique_viewers, anonymous_views, authenticated_views)
    SELECT 
        property_id,
        viewed_at::DATE as view_date,
        COUNT(*) as total_views,
        COUNT(DISTINCT clerk_id) as unique_viewers,
        COUNT(*) FILTER (WHERE clerk_id IS NULL) as anonymous_views,
        COUNT(*) FILTER (WHERE clerk_id IS NOT NULL) as authenticated_views
    FROM property_views
    WHERE viewed_at::DATE < cutoff_date
    GROUP BY property_id, viewed_at::DATE
    ON CONFLICT (property_id, view_date) 
    DO UPDATE SET 
        total_views = property_views_daily.total_views + EXCLUDED.total_views,
        unique_viewers = property_views_daily.unique_viewers + EXCLUDED.unique_viewers,
        anonymous_views = property_views_daily.anonymous_views + EXCLUDED.anonymous_views,
        authenticated_views = property_views_daily.authenticated_views + EXCLUDED.authenticated_views;
    
    GET DIAGNOSTICS v_aggregated = ROW_COUNT;
    
    INSERT INTO property_views_geo_daily (property_id, view_date, viewer_city, view_count)
    SELECT 
        property_id,
        viewed_at::DATE,
        COALESCE(viewer_city, 'Unknown'),
        COUNT(*)
    FROM property_views
    WHERE viewed_at::DATE < cutoff_date AND viewer_city IS NOT NULL
    GROUP BY property_id, viewed_at::DATE, viewer_city
    ON CONFLICT (property_id, view_date, viewer_city)
    DO UPDATE SET view_count = property_views_geo_daily.view_count + EXCLUDED.view_count;

    DELETE FROM property_views WHERE viewed_at::DATE < cutoff_date;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN QUERY SELECT v_aggregated, v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update property_details view
DROP VIEW IF EXISTS property_details;
CREATE VIEW property_details AS
SELECT 
    p.*,
    u.full_name as agent_name,
    u.avatar_url as agent_avatar,
    u.phone as agent_phone,
    u.email as agent_email,
    u.user_type as agent_type,
    r.full_name as renter_name,
    r.phone as renter_phone,
    r.email as renter_email,
    r.avatar_url as renter_avatar,
    pl.locked_at as lock_timestamp,
    pl.status as lock_status,
    ARRAY_AGG(DISTINCT a.name) as amenities,
    ARRAY_AGG(DISTINCT pi.url) as images,
    (
        SELECT COUNT(*)
        FROM favorites f
        WHERE f.property_id = p.id
    ) as favorites_count
FROM properties p
LEFT JOIN users u ON p.agent_id = u.id
LEFT JOIN property_locks pl ON p.id = pl.property_id AND pl.status = 'active'
LEFT JOIN users r ON pl.renter_id = r.id
LEFT JOIN property_amenities pa ON p.id = pa.property_id
LEFT JOIN amenities a ON pa.amenity_id = a.id
LEFT JOIN property_images pi ON p.id = pi.property_id
GROUP BY p.id, u.id, r.id, pl.id;

-- 6. Add otp_code to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS otp_code text;
COMMENT ON COLUMN transactions.otp_code IS 'Orange Money OTP code (preAuthorisationCode) used for the transaction. Used for debugging and cross-referencing with PawaPay.';
CREATE INDEX IF NOT EXISTS idx_transactions_otp_code ON transactions(otp_code) WHERE otp_code IS NOT NULL;

-- 7. Data consistency fix: Reset properties marked as "locked" without lock records
UPDATE properties 
SET status = 'en_ligne'
WHERE status = 'locked'
  AND NOT EXISTS (
    SELECT 1 FROM property_locks 
    WHERE property_id = properties.id
  );

COMMIT;
