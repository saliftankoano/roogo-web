ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS view_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_views_property_session
ON property_views(property_id, view_session_id);

CREATE OR REPLACE FUNCTION record_property_view(
    p_property_id UUID,
    p_view_session_id TEXT,
    p_user_id UUID DEFAULT NULL,
    p_clerk_id TEXT DEFAULT NULL,
    p_device_platform TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'browse',
    p_viewer_city TEXT DEFAULT NULL
) RETURNS TABLE (
    counted BOOLEAN,
    views_count BIGINT
) AS $$
DECLARE
    v_inserted_count INTEGER := 0;
    v_views_count BIGINT := 0;
BEGIN
    IF p_view_session_id IS NULL OR BTRIM(p_view_session_id) = '' THEN
        RAISE EXCEPTION 'view_session_id is required';
    END IF;

    INSERT INTO property_views (
        property_id,
        user_id,
        clerk_id,
        view_session_id,
        device_platform,
        source,
        viewer_city
    )
    VALUES (
        p_property_id,
        p_user_id,
        p_clerk_id,
        p_view_session_id,
        NULLIF(BTRIM(p_device_platform), ''),
        COALESCE(NULLIF(BTRIM(p_source), ''), 'browse'),
        NULLIF(BTRIM(p_viewer_city), '')
    )
    ON CONFLICT (property_id, view_session_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    IF v_inserted_count > 0 THEN
        UPDATE properties
        SET views_count = COALESCE(properties.views_count, 0) + 1
        WHERE id = p_property_id
        RETURNING properties.views_count INTO v_views_count;
    ELSE
        SELECT COALESCE(properties.views_count, 0)
        INTO v_views_count
        FROM properties
        WHERE id = p_property_id;
    END IF;

    RETURN QUERY SELECT v_inserted_count > 0, v_views_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
        COUNT(
            DISTINCT COALESCE(
                'clerk:' || pv.clerk_id,
                'session:' || pv.view_session_id
            )
        )::BIGINT as unique_viewers
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

    INSERT INTO property_views_daily (
        property_id,
        view_date,
        total_views,
        unique_viewers,
        anonymous_views,
        authenticated_views
    )
    SELECT
        property_id,
        viewed_at::DATE as view_date,
        COUNT(*) as total_views,
        COUNT(
            DISTINCT COALESCE(
                'clerk:' || clerk_id,
                'session:' || view_session_id
            )
        ) as unique_viewers,
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
