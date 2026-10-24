-- 107: property views are recorded again.
--
-- Migration 001 moved property_views to clerk_id and dropped user_id; migration
-- 013 (run 2026-09-13) redefined record_property_view to insert user_id again,
-- so every call failed with 42703 « column "user_id" of relation
-- "property_views" does not exist » and no view has been stored since
-- (production table empty, read 2026-10-24). Same signature, so the API route
-- keeps working unchanged: p_user_id is accepted and ignored.

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
        clerk_id,
        view_session_id,
        device_platform,
        source,
        viewer_city
    )
    VALUES (
        p_property_id,
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
