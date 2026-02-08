-- Migration: Remove unused user_id and session_id columns from property_views
-- We use clerk_id instead of user_id for user identification
-- session_id was never implemented and is not used

-- 1. Drop the policy that references user_id
DROP POLICY IF EXISTS "Users can view their own property view history" ON property_views;

-- 2. Recreate the policy using clerk_id instead
CREATE POLICY "Users can view their own property view history" 
ON property_views FOR SELECT 
USING (clerk_id = auth.jwt() ->> 'sub');

-- 3. Update the get_trending_properties function to use clerk_id
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

-- 4. Update the aggregate_old_views function to use clerk_id
CREATE OR REPLACE FUNCTION aggregate_old_views(days_threshold INTEGER DEFAULT 30)
RETURNS TABLE (aggregated_count BIGINT, deleted_count BIGINT) AS $$
DECLARE
    cutoff_date DATE;
    v_aggregated BIGINT := 0;
    v_deleted BIGINT := 0;
BEGIN
    cutoff_date := CURRENT_DATE - days_threshold;
    
    -- 1. Aggregate into daily summary
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
    
    -- 2. Aggregate geographic data
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
    
    -- 3. Aggregate platform data
    INSERT INTO property_views_platform_daily (view_date, device_platform, view_count, unique_viewers)
    SELECT 
        viewed_at::DATE,
        COALESCE(device_platform, 'unknown'),
        COUNT(*),
        COUNT(DISTINCT clerk_id)
    FROM property_views
    WHERE viewed_at::DATE < cutoff_date
    GROUP BY viewed_at::DATE, device_platform
    ON CONFLICT (view_date, device_platform)
    DO UPDATE SET 
        view_count = property_views_platform_daily.view_count + EXCLUDED.view_count,
        unique_viewers = property_views_platform_daily.unique_viewers + EXCLUDED.unique_viewers;
    
    -- 4. Delete aggregated raw records
    DELETE FROM property_views WHERE viewed_at::DATE < cutoff_date;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    
    RETURN QUERY SELECT v_aggregated, v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Drop the index on user_id
DROP INDEX IF EXISTS idx_property_views_user_id;

-- 6. Drop the user_id column (CASCADE will drop any remaining dependencies)
ALTER TABLE property_views DROP COLUMN IF EXISTS user_id CASCADE;

-- 7. Drop the session_id column
ALTER TABLE property_views DROP COLUMN IF EXISTS session_id CASCADE;
